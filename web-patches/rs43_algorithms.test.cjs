const fs=require('fs'),assert=require('node:assert/strict');
const src=fs.readFileSync('/mnt/data/rs43_algorithms.js','utf8');
const {rs43CleanPaths,rs43Revisits}=new Function(src+';return {rs43CleanPaths,rs43Revisits}')();
function p(mX,mY,t){return {lat:35+mY/111120,lng:126+mX/(111120*Math.cos(35*Math.PI/180)),time:t*1000}}
const idle=Array.from({length:80},(_,i)=>p(Math.sin(i)*9,Math.cos(i*2)*8,i*3));
let a=rs43CleanPaths([idle]);assert(a[0].length<=3,'idle must collapse');assert.equal(rs43Revisits(a).length,0,'idle must not count as re-passage');
const first=Array.from({length:26},(_,i)=>p(i*10,0,i*3));
const returning=Array.from({length:26},(_,i)=>p((25-i)*10,2,200+i*3));
let trip=rs43CleanPaths([[...first,...returning]]);let rails=rs43Revisits(trip);assert(rails.length>12,'reverse pass must be indicated');assert(rails.some(x=>x.count>=2));
let oneWay=rs43Revisits(rs43CleanPaths([first]));assert.equal(oneWay.length,0,'one-way must stay plain');
const third=Array.from({length:26},(_,i)=>p(i*10,1,450+i*3));
let tri=rs43Revisits(rs43CleanPaths([[...first,...returning,...third]]));assert(tri.some(x=>x.count===3),'triple pass gets two rails');
const parallel=Array.from({length:26},(_,i)=>p(i*10,38,200+i*3));
assert.equal(rs43Revisits(rs43CleanPaths([[...first,...parallel]])).length,0,'separate parallel road must not count');
const crossing=Array.from({length:26},(_,i)=>p(125,i*10-125,200+i*3));
assert.equal(rs43Revisits(rs43CleanPaths([[...first,...crossing]])).length,0,'crossing path must not count');
console.log('PASS six v43 route tests');