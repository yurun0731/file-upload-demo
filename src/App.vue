<template>
  <div id="app">
    <input type="file" @change="handleFileChange">
    <el-button @click="handleUpload">上传</el-button>
    <el-button v-show="hashPercentage >= 100" @click="handlePause">暂停</el-button>
    <el-button @click="handleResume">继续</el-button>
    <div>
      <div>计算文件hash</div>
      <el-progress :percentage="hashPercentage"></el-progress>
      <div>总进度</div>
      <el-progress :percentage="totalPercentage"></el-progress>
    </div>
    <!-- 切片上传进度 -->
    <el-table :data="data">
      <el-table-column prop="hash" label="切片hash" align="center"></el-table-column>
      <el-table-column label="大小(KB)" align="center">
        <template v-slot="{row}">
          {{ row.size | transformByte }}
        </template>
      </el-table-column>
      <el-table-column label="进度" align="center">
        <template v-slot="{row}">
          <div>
            <el-progress :percentage="row.percentage"></el-progress>
          </div>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script>
const Status = {
  wait: "wait",
  pause: 'pause',
  uploading: 'uploading'
}
const SIZE = 10 * 1024 * 1024;
export default {
  name: 'app',
  data: () => ({
    totalPercentage: 0,
    container: {
      file: null,
      hash: '',
    },
    status: Status.wait,
    hashPercentage: 0,
    data: [], // 要上传的数组
    requestList: [] // 切片文件xhr对象
  }),
  filters: {
    transformByte(val) {
      return Number((val / 1024).toFixed(0));
    }
  },
  computed: {
    uploadPercentage() {
      if (!this.container.file || !this.data.length) {
        return 0;
      }
      const loaded = this.data.map(item => item.size * item.percentage)
        .reduce((acc, cur) => acc + cur);
      return parseInt((loaded / this.container.file.size).toFixed(2));
    }
  },
  watch: {
    uploadPercentage(newVal) {
      if (newVal > this.totalPercentage) {
        this.totalPercentage = newVal;
      }
    }
  },
  methods: {
    handlePause() {
      this.status = Status.pause;
      this.resetData();
    },
    resetData() {
      // 里面存着xhr对象
      this.requestList.forEach(xhr => xhr? xhr.abort(): null);
      this.requestList = [];
      // 正在进行哈希计算
      if (this.container.worker) {
        this.container.worker.onmessage = null;
      }
    },
    async handleResume() {
      this.status = Status.uploading;
      const { uploadedList } = await this.verifyUpload(this.container.file.name, this.container.hash);
      await this.uploadChunks(uploadedList);
    },
    request({
      url,
      method = 'POST',
      data,
      onProgress = e => e,
      headers = {},
      requestList = []
    }) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(method, url);
        xhr.upload.onprogress = onProgress;
        Object.keys(headers).forEach(key => xhr.setRequestHeader(key, headers[key]))
        xhr.send(data);
        xhr.onload = e => {
          // 把成功上传的xhr去除
          if (requestList) {
            const xhrIndex = requestList.findIndex(item => item === xhr);
            requestList.splice(xhrIndex, 1);
          }
          resolve({
            data: e.target.response
          })
        }
        if (requestList) {
          requestList.push(xhr);
          // console.log(requestList)
        }
      })
    },
    async calculateHash(fileChunkList) {
      return new Promise(resolve => {
        // 封装需要花时间的任务
        // web workers 不会占用原来的UI主线程的资源
        this.container.worker = new Worker('/hash.js');
        this.container.worker.postMessage({ fileChunkList });
        this.container.worker.onmessage = e => {
          // console.log(e.data);
          const { percentage, hash } = e.data;
          this.hashPercentage = percentage;
          if (hash) {
            resolve(hash);
          }
        }
      })
    },
    async handleUpload(e) {
      if (!this.container.file) return;
      this.status = Status.uploading;
      const fileChunkList = this.createFileChunk(this.container.file);
      // console.log(fileChunkList);
      this.container.hash = await this.calculateHash(fileChunkList);
      // 上传并且验证是否有重复上传（秒传）
      const res = await 
      this.verifyUpload(
        this.container.file.name, 
        this.container.hash
      );
      const { shouldUpload, uploadedList } = JSON.parse(res.data);
      console.log(JSON.parse(res.data));
      if (!shouldUpload) {
        this.$message.success("上传成功！（秒传）");
        this.status = Status.wait;
        return;
      }
      this.data = fileChunkList.map(({ file }, index) => ({
        fileHash: this.container.hash, // 整个文件的hash
        index,
        hash: this.container.hash + '-' + index, // 用于分片追踪
        chunk: file,
        size: file.size,
        percentage: uploadedList.includes(index) ? 100 : 0 // 当前切片是否已经上传过
      }));
      // 上传切片
      await this.uploadChunks(uploadedList);
    },
    async uploadChunks(uploadedList = []) { 
      const requestList = this.data.map(({ chunk, hash, index }) => {
        const formData = new FormData();
        formData.append("chunk", chunk); // blob 文件
        formData.append("hash", hash); // 当前切片的hash: 文件hash+index
        formData.append("index", index);
        formData.append("filename", this.container.file.name);
        formData.append("fileHash", this.container.hash);
        return { formData, index }
      })
      .map(async ({ formData, index}) => this.request({
        url: 'http://localhost:3000',
        data: formData,
        onProgress: this.createProgressHandler(this.data[index]),
        requestList: this.requestList
      }))
      await Promise.all(requestList);
      // 发送合并请求
      // console.log('can merge..')
      // 之前上传的切片数量+本次上传的切片数量=所有切片数量
      console.log(uploadedList.length, requestList.length, this.data.length, '---')
      if (uploadedList.length + requestList.length === this.data.length) {
        await this.mergeRequest();
      }
    },
    async mergeRequest() {
      await this.request({
        url: 'http://localhost:3000/merge',
        headers: {
          "content-type": "application/json"
        },
        data: JSON.stringify({
          size: SIZE,
          fileHash: this.container.hash,
          filename: this.container.file.name
        })
      })
      this.$message.success('上传成功');
      this.status = Status.wait;
    },
    createProgressHandler(item) {
      return e => {
        // console.log(e.loaded, e.total, '---')
        console.log(e, '+++');
        item.percentage = parseInt(String(e.loaded/e.total * 100));
        // console.log(item.percentage ,111);
      }
    },
    async verifyUpload(filename, fileHash) {
      const { data } = await this.request({
        url: 'http://localhost:3000/verify',
        headers: { 'content-type': "application/json"},
        data: JSON.stringify({ // 字符串化
          filename,
          fileHash
        })
      })
      return JSON.parse(data);
    },
    createFileChunk (file, size = SIZE) {
      const fileChunkList = [];
      let cur = 0;
      while(cur < file.size) {
        fileChunkList.push({
          file: file.slice(cur, cur + size)
        })
        cur += size;
      }
      return fileChunkList;
    },
    handleFileChange(e) {
      const [file] = e.target.files;
      this.container.file = file;
      // console.log(this.container.file, 1);
      this.resetData();
    }
  }
}
</script>

