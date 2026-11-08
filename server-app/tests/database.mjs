import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
export function database(){
 const raw=new DatabaseSync(':memory:');raw.exec('PRAGMA foreign_keys=ON');
 for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())raw.exec(fs.readFileSync('drizzle/'+file,'utf8'));
 return {
  raw,
  prepare(sql){
   const statement=raw.prepare(sql);
   return {async first(){return statement.get()||null;},async all(){return {results:statement.all()};},async run(){const r=statement.run();return {meta:{changes:Number(r.changes)}};},bind(...values){return {
    async first(){return statement.get(...values)||null;},
    async all(){return {results:statement.all(...values)};},
    async run(){const r=statement.run(...values);return {meta:{changes:Number(r.changes)}};}
   };}};
  },
  async batch(statements){raw.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());raw.exec('COMMIT');return result;}catch(e){raw.exec('ROLLBACK');throw e;}}
 };
}
