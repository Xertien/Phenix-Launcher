/**
 * @author Luuxis
 * @license CC-BY-NC 4.0 - https://creativecommons.org/licenses/by-nc/4.0
 */

export class skin2D {
    async creatHeadTexture(data) {
        let image = await getData(data)
        if (!image) return false;
        return await new Promise((resolve, reject) => {
            image.addEventListener('load', e => {
                let cvs = document.createElement('canvas');
                cvs.width = 8;
                cvs.height = 8;
                let ctx = cvs.getContext('2d');
                ctx.drawImage(image, 8, 8, 8, 8, 0, 0, 8, 8);
                ctx.drawImage(image, 40, 8, 8, 8, 0, 0, 8, 8);
                return resolve(cvs.toDataURL());
            });
            image.addEventListener('error', () => resolve(false));
        })
    }
}

async function getData(data) {
    if (typeof data !== 'string' || !data.startsWith('data:image/')) return null;
    let img = new Image();
    img.src = data;
    return img;
}
