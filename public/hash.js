// self => this 当前线程
self.importScripts('/spark-md5.min.js') // 通过内容计算md5值，内容相同，md5值一样
self.onmessage = e => {
  const { fileChunkList } = e.data;
  const spark = new self.SparkMD5.ArrayBuffer();
  let percentage = 0;
  let count = 0;
  // 计算hash
  const loadNext = index => {
    const reader = new FileReader(); // 文件阅读对象
    reader.readAsArrayBuffer(fileChunkList[index].file);
    reader.onload = e => {
      count++;
      spark.append(e.target.result);
      if (count === fileChunkList.length) {
        self.postMessage({
          percentage: 100,
          hash: spark.end()
        });
        self.close(); // 关闭线程
      } else {
        // 还没加载完成
        percentage += 100 / fileChunkList.length;
        self.postMessage({
          percentage
        })
        loadNext(count);
      }
    }
  }
  loadNext(0);
}