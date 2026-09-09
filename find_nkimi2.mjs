import mongoose from 'mongoose';
const uri = 'mongodb://manfess_admin:GOLDBLISSZ33@ac-88ksdaw-shard-00-00.bf8h1wy.mongodb.net:27017,ac-88ksdaw-shard-00-01.bf8h1wy.mongodb.net:27017,ac-88ksdaw-shard-00-02.bf8h1wy.mongodb.net:27017/MANFESS?tls=true&authSource=admin&replicaSet=atlas-10fmul-shard-0&retryWrites=true&w=majority';
await mongoose.connect(uri, { serverSelectionTimeoutMS: 30000 });
const db = mongoose.connection.db;
const N='6a97b0d9ac4ccdf7ea024cb3';
const C={OL3:'6a970694530d27459070478b',OL4A:'6a9706a5530d27459070478c',OL4C:'6a9706b4530d27459070478d',OL4S:'6a97aa36909973238d6acc02',OL5A:'6a9706c7530d27459070478e',OL5C:'6a9706d7530d27459070478f',OL5S:'6a97aa0e909973238d6acc01',ALAR:'6a97a2079f9c0d8ee43447d3'};
const all=await db.collection('timetables').find({academicYear:'2026-2027'}).toArray();
const classBusy={}; for(const k of Object.keys(C)) classBusy[k]=new Set();
const nBusy=new Set();
all.forEach(e=>{
  const cid=e.classId.toString();
  for(const[k,v]of Object.entries(C)) if(v===cid) classBusy[k].add(e.day+'|'+e.periodNumber);
  if(e.teacherId.toString()===N) nBusy.add(e.day+'|'+e.periodNumber);
});
console.log('Nkimi busy:', [...nBusy].sort().join(' '));
for(const day of ['Tuesday','Wednesday']){
  console.log('=== '+day+' ===');
  const groups={OL4:['OL4A','OL4C','OL4S'],OL5:['OL5A','OL5C','OL5S'],ALAR:['ALAR'],OL3:['OL3']};
  for(const [label,group] of Object.entries(groups)){
    const free=[];
    for(let p=1;p<=6;p++){
      const key=day+'|'+p;
      const classOk=group.every(k=>!classBusy[k].has(key));
      const nOk=!nBusy.has(key);
      if(classOk&&nOk) free.push(p);
    }
    console.log('  '+label+' free+BOTH: P'+free.join(', '));
  }
}
await mongoose.disconnect();
console.log('Done!');