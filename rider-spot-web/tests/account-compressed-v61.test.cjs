'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const {deflateRawSync,gzipSync}=require('node:zlib');
const {TextEncoder,TextDecoder}=require('node:util');

function start(){
 const doc={readyState:'loading',addEventListener(){},createElement(){return {}}};
 const win={document:doc,crypto:webcrypto,CompressionStream,DecompressionStream,
  addEventListener(){},setInterval(){},navigator:{},location:{href:'https://rider-spot.jazzhjm.workers.dev/'}};
 const globals={window:win,document:doc,Blob,Response,TextEncoder,TextDecoder,
  CompressionStream,DecompressionStream,Headers,URL,Date,Promise,btoa,atob,Event};
 const source=fs.readFileSync('rider-spot-web/src/account-backup-restore-v52.js','utf8');
 vm.runInNewContext(source,globals,{timeout:1000});
 assert.ok(win.__rsAccountBackupCompressionV61);
 return win.__rsAccountBackupCompressionV61;
}
const uuid='11111111-2222-4333-8444-555555555555';
function fixture(){
 const route=[];
 for(let i=0;i<14000;i++){
  route.push({lat:35.18+i*.000001,lng:126.82+i*.000001,t:1795000000000+i*5000,
   speed:0.1,heading:0,accuracy:2.71828,seq:i+1});
 }
 return {
  format:'riderspot-account-backup-v52',created_at:'2026-11-23T20:56:20Z',
  account_id:uuid,data_policy:'gps-original-only-on-device',
  tables:{trips:[{id:uuid,user_id:uuid,points:[],events:[{type:'정차 · 1분',at:'2026-11-22T12:00:00Z'}]}]},
  legacy_gps:[{trip_id:uuid,points:route,events:[],partial:false}],
  summary:{records:148,trips:1,old_cloud_gps_points:route.length}
 };
}
const fileOf=(raw)=>{const data=Buffer.isBuffer(raw)?raw:Buffer.from(raw);return {size:data.length,arrayBuffer:async()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)};};

function zipSingle(name,bytes,crc32,corrupt=false){
 const compressed=deflateRawSync(bytes);
 const filename=Buffer.from(name);
 const local=Buffer.alloc(30);
 local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);
 local.writeUInt16LE(8,8);local.writeUInt32LE(crc32(bytes),14);
 local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(bytes.length,22);
 local.writeUInt16LE(filename.length,26);
 const central=Buffer.alloc(46);
 central.writeUInt32LE(0x02014b50,0);
 central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);
 central.writeUInt16LE(8,10);central.writeUInt32LE((crc32(bytes)^(corrupt?1:0))>>>0,16);
 central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(bytes.length,24);
 central.writeUInt16LE(filename.length,28);
 const offset=local.length+filename.length+compressed.length;
 const eocd=Buffer.alloc(22);
 eocd.writeUInt32LE(0x06054b50,0);
 eocd.writeUInt16LE(1,8);eocd.writeUInt16LE(1,10);
 eocd.writeUInt32LE(central.length+filename.length,12);eocd.writeUInt32LE(offset,16);
 return Buffer.concat([local,filename,compressed,central,filename,eocd]);
}
test('new compressed JSON saves ~80% and restores exact GPS route and stop events',async()=>{
 const codec=start(),archive=fixture(),raw=JSON.stringify(archive);
 const zipped=await codec.compressedAccountJsonV61(archive,raw);
 const shell=JSON.parse(zipped.content);
 assert.equal(shell.format,'riderspot-account-backup-v52');
 assert.equal(shell.account_id,uuid);
 assert.deepEqual(JSON.stringify(shell.tables),'{}');
 assert.ok(zipped.compressedBytes/raw.length<.4, 'compressed wrapper should be smaller');
 const result=await codec.parseBackupFileV61(fileOf(zipped.content));
 assert.equal(JSON.stringify(result),raw);
 assert.equal(result.legacy_gps[0].points.length,14000);
 assert.equal(result.tables.trips[0].events[0].type,'정차 · 1분');
 console.log('v61 account JSON compression',zipped.originalBytes,zipped.compressedBytes,
  Math.round(100*(1-zipped.compressedBytes/zipped.originalBytes))+'%');
});
test('legacy uncompressed JSON restores unchanged',async()=>{
 const codec=start(),archive=fixture();
 assert.deepEqual(JSON.stringify(await codec.parseBackupFileV61(fileOf(JSON.stringify(archive)))),
  JSON.stringify(archive));
});
test('direct ZIP and gzip restore without extracting by user',async()=>{
 const codec=start(),raw=Buffer.from(JSON.stringify(fixture()));
 const zip=zipSingle('RiderSpot-Account-2026-11-23.json',raw,codec.crc32);
 assert.deepEqual(JSON.stringify(await codec.parseBackupFileV61(fileOf(zip))),raw.toString());
 assert.deepEqual(JSON.stringify(await codec.parseBackupFileV61(fileOf(gzipSync(raw)))),raw.toString());
});
test('reject corrupted ZIP CRC and compressed envelope digest; do not restore',async()=>{
 const codec=start(),raw=Buffer.from(JSON.stringify(fixture()));
 const bad=zipSingle('RiderSpot-Account-2026-11-23.json',raw,codec.crc32,true);
 await assert.rejects(codec.parseBackupFileV61(fileOf(bad)),/무결성/);
 const archived=JSON.parse((await codec.compressedAccountJsonV61(JSON.parse(raw.toString()),raw.toString())).content);
 archived.compression_v61.sha256='0'.repeat(64);
 await assert.rejects(codec.parseBackupFileV61(fileOf(JSON.stringify(archived))),/검증/);
});
test('reject suspicious archives and prevent decompression bomb',async()=>{
 const codec=start();
 await assert.rejects(codec.parseBackupFileV61(fileOf(Buffer.from('not a backup'))),/크기/);
 const bigger=Buffer.alloc(8_000_000,0x30);
 await assert.rejects(codec.parseBackupFileV61(fileOf(bigger)),/크기/);
});
