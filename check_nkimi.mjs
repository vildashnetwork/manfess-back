import mongoose from 'mongoose';
const uri = 'mongodb://manfess_admin:GOLDBLISSZ33@ac-88ksdaw-shard-00-00.bf8h1wy.mongodb.net:27017,ac-88ksdaw-shard-00-01.bf8h1wy.mongodb.net:27017,ac-88ksdaw-shard-00-02.bf8h1wy.mongodb.net:27017/MANFESS?tls=true&authSource=admin&replicaSet=atlas-10fmul-shard-0&retryWrites=true&w=majority';
await mongoose.connect(uri, { serverSelectionTimeoutMS: 30000 });
const db = mongoose.connection.db;
const N='6a97b0d9ac4ccdf7ea024cb3';
const ACAD='2026-2027';
const rows=await db.collection('timetables').find({academicYear:ACAD,teacherId:new mongoose.Types.ObjectId(N)}).toArray();
console.log('=== NKIMI total:', rows.length, '===');
rows.sort((a,b)=>{const d={Monday:0,Tuesday:1,Wednesday:2,Thursday:3,Friday:4};return (d[a.day]*10+a.periodNumber)-(d[b.day]*10+b.periodNumber);});
rows.forEach(e=>console.log(e.day,'P'+e.periodNumber,e.subjectName,e.className));
// user record
const u=await db.collection('users').findOne({_id:new mongoose.Types.ObjectId(N)});
console.log('availableDays:', JSON.stringify(u.availableDays));
await mongoose.disconnect();
console.log('Done!');