#!/usr/bin/env python3
"""Generate the complete timetable regeneration script."""
script = r'''// Timetable regeneration - period-major compaction + double periods
import mongoose from 'mongoose';
const uri = 'mongodb://manfess_admin:GOLDBLISSZ33@ac-88ksdaw-shard-00-00.bf8h1wy.mongodb.net:27017,ac-88ksdaw-shard-00-01.bf8h1wy.mongodb.net:27017,ac-88ksdaw-shard-00-02.bf8h1wy.mongodb.net:27017/MANFESS?tls=true&authSource=admin&replicaSet=atlas-10fmul-shard-0&retryWrites=true&w=majority';
await mongoose.connect(uri, { serverSelectionTimeoutMS: 30000 });
const db = mongoose.connection.db;
const log = console.log;

const T = {'epie':'6a97a00a3c1247098a21e166','evaristus':'6a97a2c89f9c0d8ee43447d4','marvis':'6a97a577909973238d6acbf9','nsoseh':'6a97a5db909973238d6acbfa','yoland':'6a97a66b909973238d6acbfb','euinice':'6a97a702909973238d6acbfc','billa':'6a97a8c4909973238d6acbfe','fortune':'6a97a914909973238d6acbff','ando':'6a97a9c8909973238d6acc00','gildeon':'6a97aa79909973238d6acc03','mercy':'6a97afb5ac4ccdf7ea024cb1','nkimi':'6a97b0d9ac4ccdf7ea024cb3','martin':'6a9856e680277c731bad9591','teacherx':'6a97a806909973238d6acbfd'};
const TNAME = Object.fromEntries(Object.entries(T).map(([k,v])=>[v,k]));
const C = {'B1':'6a9704c85032926f622478fe','B2':'6a97cb51b9515c2fc9126dd1','OL3':'6a970694530d27459070478b','OL4A':'6a9706a5530d27459070478c','OL4C':'6a9706b4530d27459070478d','OL4S':'6a97aa36909973238d6acc02','OL5A':'6a9706c7530d27459070478e','OL5C':'6a9706d7530d27459070478f','OL5S':'6a97aa0e909973238d6acc01','ALSC':'6a97a1e89f9c0d8ee43447d2','ALAR':'6a97a2079f9c0d8ee43447d3'};
const CNAME = Object.fromEntries(Object.entries(C).map(([k,v])=>[v,k]));
const S = {'entr':'6a979e683c1247098a21e165','mkt':'6a97b3f2ac4ccdf7ea024cb4','sm':'6a97b653ac4ccdf7ea024cb5','geo1':'6a97b6eeac4ccdf7ea024cb6','geo2':'6a97b797ac4ccdf7ea024cb7','cit':'6a97b8f4ac4ccdf7ea024cb8','com':'6a97bab1ac4ccdf7ea024cb9','pm':'6a97bb25ac4ccdf7ea024cba','eng1':'6a97ec38d648cdd3b375ff04','eng2':'6a97ed6ad648cdd3b375ff05','lit2':'6a97f07cd648cdd3b375ff06','lit1':'6a97f53e3e41b0fcc3fa1dea','econ1':'6a97f6bd3e41b0fcc3fa1deb','econ2':'6a97f70d3e41b0fcc3fa1dec','hist2':'6a97fafb2953f86db205a79d','hist1':'6a97fb972953f86db205a79e','math':'6a984a4980277c731bad9584','pms':'6a984a8880277c731bad9585','phys2':'6a984ad680277c731bad9586','phys1':'6a984b7080277c731bad9587','cs':'6a984e7a80277c731bad9588','pmm':'6a984ef780277c731bad9589','bizmath':'6a984f9680277c731bad958a','acct':'6a9850a080277c731bad958b','digmkt':'6a98520a80277c731bad958c','chem1':'6a98546b80277c731bad958d','chem2':'6a9854ab80277c731bad958e','bio1':'6a98552880277c731bad958f','bio2':'6a98555680277c731bad9590','fr1':'6a98579b80277c731bad9592','fr2':'6a9857ce80277c731bad9593'};
const SECOND = new Set([C.OL3, C.ALSC, C.ALAR]);
const PERIODS = [[1,'04:30','05:15'],[2,'05:15','06:00'],[3,'06:00','06:45'],[4,'06:45','07:30'],[5,'07:30','08:15'],[6,'08:15','09:00']];
const ACAD = '2026-2027';
const DAYS_ORDERED = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
const MonWed = ['Monday','Wednesday'];
const MonTue = ['Monday','Tuesday'];
const TueThu = ['Tuesday','Thursday'];
const TueThuFri = ['Tuesday','Thursday','Friday'];
const MonWedFri = ['Monday','Wednesday','Friday'];
const All5 = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
const MonThu = ['Monday','Thursday'];
const MercyDays = ['Tuesday','Wednesday','Friday'];
const XDays = ['Monday','Tuesday','Wednesday','Thursday'];

await db.collection('schoolsettings').updateOne(
  { academicYear: ACAD },
  { $set: { schoolDays: DAYS_ORDERED, updatedAt: new Date() } }
);

// ---------------- REQUIREMENTS ----------------
const reqs = [
  // Gildeon - Wed only (6 slots, 5 lessons)
  { t: T.gildeon, s: S.hist2, cls: [C.ALAR], n: 3, days: ['Wednesday'], label: 'Hist ALAR x3' },
  { t: T.gildeon, s: S.hist1, cls: [C.OL5A, C.OL5S], n: 2, days: ['Wednesday'], label: 'Hist OL5 x2' },
  // Yoland - Mon/Tue (12 slots, 10 lessons)
  { t: T.yoland, s: S.chem1, cls: [C.OL4S], n: 2, days: MonTue, label: 'Chem OL4S x2' },
  { t: T.yoland, s: S.chem1, cls: [C.OL5S], n: 2, days: MonTue, label: 'Chem OL5S x2' },
  { t: T.yoland, s: S.chem2, cls: [C.ALSC], n: 1, days: MonTue, label: 'Chem ALSC x1' },
  { t: T.yoland, s: S.bio1, cls: [C.OL3], n: 2, days: MonTue, label: 'Bio OL3 x2' },
  { t: T.yoland, s: S.bio2, cls: [C.ALSC, C.ALAR], n: 2, days: MonTue, label: 'Bio AL x2' },
  // Ando - Mon/Wed (12 slots, 9 lessons)
  { t: T.ando, s: S.hist2, cls: [C.ALAR], n: 2, days: MonWed, label: 'Hist ALAR x2' },
  { t: T.ando, s: S.geo2, cls: [C.ALAR], n: 2, days: MonWed, label: 'Geo ALAR x2' },
  { t: T.ando, s: S.geo1, cls: [C.OL5A, C.OL5S], n: 2, days: MonWed, label: 'Geo OL5 x2' },
  { t: T.ando, s: S.hist1, cls: [C.OL5A, C.OL5S], n: 1, days: MonWed, label: 'Hist OL5 x1' },
  { t: T.ando, s: S.cit, cls: [C.OL5A, C.OL5S], n: 2, days: MonWed, label: 'Cit OL5 x2' },
'''
with open('regen_p1.txt', 'w') as f:
    f.write(script)
print('Part 1 written')
