// Test-only reverse proxy. The rebuilt UI is served from dist while unchanged
// Worker API and legacy assets are read from the live v60 origin.
const {createServer}=require("node:http");
const {readFile,stat}=require("node:fs/promises");
const {resolve,join,extname}=require("node:path");
const root=resolve(__dirname,"../dist");
const upstream="https://rider-spot.jazzhjm.workers.dev";
const port=Number(process.env.RIDER_PREVIEW_PORT||8789);
const types={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"application/javascript; charset=utf-8",".mjs":"application/javascript; charset=utf-8",".json":"application/json; charset=utf-8"};
const manifest=require(join(root,"release.json"));
const assetSet=new Set(manifest.files);
createServer(async(req,res)=>{
  const url=new URL(req.url,"http://127.0.0.1:"+port);
  const pathname=url.pathname==="/"?"/index.html":url.pathname;
  try {
    if(assetSet.has(pathname) && (req.method==="GET"||req.method==="HEAD")){
      const file=resolve(root,"."+pathname);
      if(!file.startsWith(root+"/"))throw Error("Unsafe path");
      const body=await readFile(file);
      res.writeHead(200,{"content-type":types[extname(file)]||"application/octet-stream","cache-control":"no-store","content-length":body.length});
      res.end(req.method==="HEAD"?"":body);return;
    }
    const headers={};
    for(const [key,value] of Object.entries(req.headers)){
      if(!["host","connection","content-length","origin","referer","accept-encoding"].includes(key))headers[key]=value;
    }
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const body=chunks.length?Buffer.concat(chunks):undefined;
    const response=await fetch(upstream+url.pathname+url.search,{method:req.method,headers,body,redirect:"manual",signal:AbortSignal.timeout(30000)});
    const out={};
    for(const [key,value] of response.headers)if(!["content-encoding","transfer-encoding","content-length","connection","content-security-policy"].includes(key))out[key]=value;
    out["cache-control"]="no-store";
    const bytes=Buffer.from(await response.arrayBuffer());
    out["content-length"]=bytes.length;
    res.writeHead(response.status,out);res.end(bytes);
  }catch(e){console.error("preview error",pathname,String(e));res.writeHead(502,{"content-type":"text/plain"});res.end("QA preview origin error");}
}).listen(port,"127.0.0.1",()=>console.log("Rider Spot local candidate ready on "+port));
