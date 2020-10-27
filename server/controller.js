const path = require('path');
const fse = require('fs-extra');
const multiparty = require('multiparty');

const UPLOAD_DIR = path.resolve(__dirname, '.', 'target')

const extractExt =  filename => 
  filename.slice(filename.lastIndexOf('.'), filename.length);

const resolvePost = async (ctx) => {
  return new Promise(resolve => {
    // post数据慢慢过来
    let chunk = '';
    ctx.req.on("data", data => {
      chunk += data; // 二进制流
    })
    ctx.req.on('end', () => {
      // console.log('end', JSON.parse(chunk));
      resolve(JSON.parse(chunk));
    })
  })
}

const pipeStream = (path, writeStream) => 
  new Promise(resolve => {
    const readStream = fse.createReadStream(path);
    readStream.on('end', () => {
      resolve();
    })
    readStream.pipe(writeStream);
  })


const mergeFileChunk = async (filePath, fileHash, size) => {
  const chunkDir = path.resolve(UPLOAD_DIR, fileHash);
  const chunkPaths = await fse.readdir(chunkDir);
  chunkPaths.sort((a, b) => a.split('-')[1] - b.split('-')[1]);
  await Promise.all(
    chunkPaths.map((chunkPath, index) => 
      pipeStream(
        path.resolve(chunkDir, chunkPath),
        fse.createWriteStream(filePath, {
          start: index * size,
          end: (index + 1) * size
        })
      )
    )
  )
}

module.exports = class {
  async handleVerifyUpload(ctx) {
    // 服务器端有没有此文件
    // 读取post的data，bodyPaser
    const data = await resolvePost(ctx);
    const { filename, fileHash } = data;
    const ext = extractExt(filename);
    const filePath = path.resolve(UPLOAD_DIR, `${fileHash}${ext}`);
    if (fse.existsSync(filePath)) {
      return JSON.stringify({
        shouldUpload: false
      });
    } else {
      return JSON.stringify({
        shouldUpload: true,
        uploadedList: []
      });
    }
  } 
  async handleFormData(ctx) {
    // 处理带有文件上传的表单
    const multipart = new multiparty.Form();
    let flag = false;
    multipart.parse(ctx.req, async (err, fields, files) => {
      if (err) {
        flag = false;
        return;
      }
      const [chunk] = files.chunk;
      const [hash] = fields.hash; // hash块
      const [fileHash] = fields.fileHash;
      const [filename] = fields.filename;
      // console.log(chunk, hash, fileHash, filename);
      const filePath = path.resolve(UPLOAD_DIR, `${fileHash}${extractExt(filename)}`); // 流入地址
      const chunkDir = path.resolve(UPLOAD_DIR, fileHash);
      console.log(filePath, chunkDir, 111);
      // 文件存在
      if (fse.existsSync(filePath)) {
        return;
      }
      // 目录是否存在
      if (!fse.existsSync(chunkDir)) {
        await fse.mkdirs(chunkDir);
      }
      // 切片地址
      await fse.move(chunk.path, path.resolve(chunkDir, hash));
      flag = true;
    })
    return flag;
  }
  async handleMerge(ctx) {
    const data = await resolvePost(ctx);
    const { filename, fileHash, size } = data;
    const ext = extractExt(filename);
    const filePath = path.resolve(UPLOAD_DIR, `${fileHash}${ext}`);
    await mergeFileChunk(filePath, fileHash, size);
    return JSON.stringify({
      code: 0, 
      msg: 'merge-success', 
    })
  }
}