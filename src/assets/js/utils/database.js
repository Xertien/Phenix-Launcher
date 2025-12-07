/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

const { NodeBDD, DataType } = require('node-bdd');
const nodedatabase = new NodeBDD()
const { ipcRenderer } = require('electron')

let dev = process.env.NODE_ENV === 'dev';

class database {
    async creatDatabase(tableName, tableConfig) {
        return await nodedatabase.intilize({
            databaseName: 'Databases',
            fileType: dev ? 'sqlite' : 'db',
            tableName: tableName,
            path: `${await ipcRenderer.invoke('path-user-data')}${dev ? '../..' : '/databases'}`,
            tableColumns: tableConfig,
        });
    }

    async getDatabase(tableName) {
        return await this.creatDatabase(tableName, {
            json_data: DataType.TEXT.TEXT,
        });
    }

    async createData(tableName, data) {
        let table = await this.getDatabase(tableName);
        data = await nodedatabase.createData(table, { json_data: JSON.stringify(data) })
        let id = data.id
        data = JSON.parse(data.json_data)
        data.ID = id
        return data
    }

    async readData(tableName, key = 1) {
        let table = await this.getDatabase(tableName);
        try {
            let data = await nodedatabase.getDataById(table, key)
            if (data) {
                let id = data.id
                data = JSON.parse(data.json_data)
                data.ID = id
            }
            return data ? data : undefined
        } catch (error) {
            console.error(`[Database] Error reading data from ${tableName}:`, error);
            try {
                await nodedatabase.deleteData(table, key);
                console.warn(`[Database] Corrupted entry deleted from ${tableName}`);
            } catch (e) { }
            return undefined
        }
    }

    async readAllData(tableName) {
        let table = await this.getDatabase(tableName);
        try {
            let data = await nodedatabase.getAllData(table)
            let validData = [];
            let corruptedIds = [];

            for (let info of data) {
                try {
                    let id = info.id
                    let parsed = JSON.parse(info.json_data)
                    parsed.ID = id
                    validData.push(parsed)
                } catch (parseError) {
                    console.error(`[Database] Corrupted entry in ${tableName}:`, info.id);
                    corruptedIds.push(info.id);
                }
            }

            // Auto-clean corrupted entries
            for (let id of corruptedIds) {
                try {
                    await nodedatabase.deleteData(table, id);
                    console.warn(`[Database] Deleted corrupted entry ${id} from ${tableName}`);
                } catch (e) { }
            }

            return validData;
        } catch (error) {
            console.error(`[Database] Error reading all data from ${tableName}:`, error);
            return [];
        }
    }

    async updateData(tableName, data, key = 1) {
        let table = await this.getDatabase(tableName);
        await nodedatabase.updateData(table, { json_data: JSON.stringify(data) }, key)
    }

    async deleteData(tableName, key = 1) {
        let table = await this.getDatabase(tableName);
        await nodedatabase.deleteData(table, key)
    }
}

export default database;