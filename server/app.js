const path = require('path');
const Koa = require('koa');
const Controller = require('./controller.js');

const controller = new Controller();

const app = new Koa();

app.use(async (ctx, next) => {
  ctx.set("Access-Control-Allow-Origin", "*");
  ctx.set("Access-Control-Allow-Headers", "*");
  ctx.set("Content-Type", "application/json");
  await next();
})

app.use(async (ctx, next) => {
  if (ctx.url === '/') {
    const res = await controller.handleFormData(ctx); 
    if (res) {
      ctx.body = { code: 0, msg: 'success', data: null };
    } else {
      ctx.body = { code: 0, msg: 'error', data: null };
    }
  } else if (ctx.url === '/merge' && ctx.method === 'POST') {
    const res = await controller.handleMerge(ctx);
    ctx.body = res;
    ctx.body = { code: 0, msg: 'success' };
  } else if (ctx.url === '/merge' && ctx.method === 'OPTIONS') {
    ctx.body = 200;
  } else if (ctx.url === '/verify' && ctx.method === 'OPTIONS') {
    ctx.body = 200;
  } else if (ctx.url === '/verify' && ctx.method === 'POST') {
    const result = await controller.handleVerifyUpload(ctx);
    ctx.body = { code: 0, msg: 'verify-success', data: result }
  }
})



app.listen(3000, () => console.log('listening on port 3000..'));
