const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { NodeBDD, DataType } = require('node-bdd');
const nodedatabase = new NodeBDD();

let dev = process.env.NODE_ENV === 'dev';

function toKey(key) {
    let number = typeof key === 'string' && /^\d{1,15}$/.test(key) ? Number(key) : key;
    if (!Number.isSafeInteger(number) || number < 1) throw new Error('Invalid database key');
    return number;
}

class Database {
    relocateLegacy() {
        if (dev) return;
        let legacyPath = path.join(app.getPath('userData'), 'databases');
        let newPath = path.join(app.getPath('userData'), 'launcher-db');
        try {
            if (fs.existsSync(legacyPath) && !fs.existsSync(newPath)) fs.renameSync(legacyPath, newPath);
        } catch (error) {
            console.error(`[Database] Migration du dossier impossible: ${error?.message || error}`);
        }
    }

    async creatDatabase(tableName, tableConfig) {
        return await nodedatabase.intilize({
            databaseName: 'Databases',
            fileType: dev ? 'sqlite' : 'db',
            tableName: tableName,
            path: `${app.getPath('userData')}${dev ? '../..' : '/launcher-db'}`,
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
        data = await nodedatabase.createData(table, { json_data: JSON.stringify(data) });
        let id = data.id;
        data = JSON.parse(data.json_data);
        data.ID = id;
        return data;
    }

    async readData(tableName, key = 1) {
        key = toKey(key);
        let table = await this.getDatabase(tableName);
        try {
            let data = await nodedatabase.getDataById(table, key);
            if (data) {
                let id = data.id;
                data = JSON.parse(data.json_data);
                data.ID = id;
            }
            return data ? data : undefined;
        } catch (error) {
            console.error(`[Database] Error reading data from ${tableName}: ${error?.message || error}`);
            try {
                await nodedatabase.deleteData(table, key);
                console.warn(`[Database] Corrupted entry deleted from ${tableName}`);
            } catch (e) { }
            return undefined;
        }
    }

    async readAllData(tableName) {
        let table = await this.getDatabase(tableName);
        try {
            let data = await nodedatabase.getAllData(table);
            let validData = [];
            let corruptedIds = [];

            for (let info of data) {
                try {
                    let id = info.id;
                    let parsed = JSON.parse(info.json_data);
                    parsed.ID = id;
                    validData.push(parsed);
                } catch (parseError) {
                    console.error(`[Database] Corrupted entry in ${tableName}: ${info.id}`);
                    corruptedIds.push(info.id);
                }
            }

            for (let id of corruptedIds) {
                try {
                    await nodedatabase.deleteData(table, toKey(id));
                    console.warn(`[Database] Deleted corrupted entry ${id} from ${tableName}`);
                } catch (e) { }
            }

            return validData;
        } catch (error) {
            console.error(`[Database] Error reading all data from ${tableName}: ${error?.message || error}`);
            return [];
        }
    }

    async updateData(tableName, data, key = 1) {
        key = toKey(key);
        let table = await this.getDatabase(tableName);
        await new Promise((resolve, reject) => {
            table.table.run(`UPDATE ${table.config.tableName} SET json_data = ?, updatedAt = ? WHERE id = ?`, [JSON.stringify(data), new Date(), key], err => {
                if (err) return reject(err);
                resolve();
            });
        });
    }

    async deleteData(tableName, key = 1) {
        key = toKey(key);
        let table = await this.getDatabase(tableName);
        await nodedatabase.deleteData(table, key);
    }

    async deleteAllData(tableName) {
        let table = await this.getDatabase(tableName);
        await nodedatabase.deleteAllData(table);
        await new Promise(resolve => {
            table.table.run('VACUUM', err => {
                if (err) console.warn(`[Database] VACUUM impossible: ${err.message}`);
                resolve();
            });
        });
    }
}

module.exports = new Database();
