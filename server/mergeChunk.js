const fse = require('fs-extra');
const path = require('path');

const UPLOAD_DIR = path.resolve(__dirname, '.', 'target');

const filePath = path.resolve(UPLOAD_DIR, '张宇 - 曲终人散');
const filename = '张宇 - 曲终人散.mflac';

const pipeStream = (path, writeStream) => 
  new Promise(resolve => {
    const readStream = fse.createReadStream(path);
    readStream.on("end", () => {
      fse.unlinkSync(path); // 删除文件
      resolve();
    })
    readStream.pipe(writeStream);
  })

const mergeFileChunk = async (filePath, filename, size) => {
  const chunkDir = path.resolve(filePath);
  const chunkPaths = await fse.readdir(chunkDir);
  const len = chunkPaths[0].split('-').length;
  chunkPaths.sort((a, b) => a.split('-')[len - 1] - b.split('-')[len - 1])
  await Promise.all(
    chunkPaths.map((chunkPath, index) => 
      pipeStream(
        path.resolve(chunkDir, chunkPath),
        fse.createWriteStream(filename, {
          start: index * size,
          end: (index + 1) * size
        })
      )
    )
  )
  // console.log('文件合并成功');
  // 删除文件夹
  fse.rmdirSync(chunkDir);
}

mergeFileChunk(filePath, filename, 5 * 1024 * 1024);
// module.exports = mergeFileChunk;