import { mkdir,writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { requestSchema,serverSchema,limits } from './schema.js';
import {v2RequestSchema,v2ServerSchema} from './m2.js';
import {v3RequestSchema,v3ServerSchema,payloadManifestSchema} from './m3.js';
import {v4RequestSchema,v4ServerSchema} from './v4.js';
const allowed=new Set(['type','properties','required','additionalProperties','anyOf','items','maxItems','minLength','maxLength','pattern','const','x-maxUtf8Bytes','x-maxJsonBytes','minimum','maximum','x-uniqueModelPairs']);
function check(schema:unknown):void{
 if(!schema||typeof schema!=='object'||Array.isArray(schema))throw new Error('UNSUPPORTED_SCHEMA');
 for(const [key,value] of Object.entries(schema)){
  if(!allowed.has(key))throw new Error(`UNSUPPORTED_SCHEMA ${key}`);
  if(key==='type'&&!['object','array','string','boolean','number','integer','null'].includes(String(value)))throw new Error('UNSUPPORTED_SCHEMA type');
  if(key==='properties')for(const sub of Object.values(value as object))check(sub);
  if(key==='items')check(value);
  if(key==='anyOf')for(const sub of value as unknown[])check(sub);
 }
}
export function generateHeader(extra?:unknown,version:1|2|3|4=1):string{
 const req=version===1?requestSchema:version===2?v2RequestSchema:version===3?v3RequestSchema:v4RequestSchema,server=version===1?serverSchema:version===2?v2ServerSchema:version===3?v3ServerSchema:v4ServerSchema;
 if(extra!==undefined)check(extra);
 check(req);check(server);
 const header=`// Generated from TypeBox; do not edit.\n#pragma once
#include <cmath>${version>=3?'\n#include <QSet>':''}
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonArray>
#include <QJsonValue>
#include <QRegularExpression>
#include <QStringDecoder>
namespace ${version===1?'TildeProtocol':version===2?'TildeProtocolV2':version===3?'TildeProtocolV3':'TildeProtocolV4'} {
constexpr qsizetype MaxFrame=${limits.frame}, MaxInput=${version>=3?131072:limits.inputBytes}, MaxView=${limits.viewBytes};
inline bool check(const QJsonObject &s,const QJsonValue &v){
 if(s.contains("const")&&s.value("const")!=v)return false;
 if(s.contains("anyOf")){for(const auto &b:s.value("anyOf").toArray())if(check(b.toObject(),v))return true;return false;}
 const QString type=s.value("type").toString();
 if(type=="object"){
  if(!v.isObject())return false;const auto o=v.toObject(),p=s.value("properties").toObject();
  for(const auto &k:s.value("required").toArray())if(!o.contains(k.toString()))return false;
  if(s.value("additionalProperties")==false)for(auto i=o.begin();i!=o.end();++i)if(!p.contains(i.key()))return false;
  for(auto i=p.begin();i!=p.end();++i)if(o.contains(i.key())&&!check(i.value().toObject(),o.value(i.key())))return false;
  if(s.contains("x-maxJsonBytes")&&QJsonDocument(o).toJson(QJsonDocument::Compact).size()>s.value("x-maxJsonBytes").toInt())return false;
 }else if(type=="array"){
  if(!v.isArray())return false;const auto a=v.toArray();if(s.contains("maxItems")&&a.size()>s.value("maxItems").toInt())return false;
  ${version>=3?'if(s.value("x-uniqueModelPairs").toBool()){QSet<QString> seen;for(const auto &x:a){const auto o=x.toObject();const auto key=QString::fromUtf8(QJsonDocument(QJsonArray{o.value("providerId"),o.value("modelId")}).toJson(QJsonDocument::Compact));if(seen.contains(key))return false;seen.insert(key);}}\n  ':''}for(const auto &x:a)if(!check(s.value("items").toObject(),x))return false;
 }else if(type=="string"){
  if(!v.isString())return false;const auto text=v.toString();const auto n=text.toUcs4().size();
  if(s.contains("minLength")&&n<s.value("minLength").toInt())return false;
  if(s.contains("maxLength")&&n>s.value("maxLength").toInt())return false;
  if(s.contains("x-maxUtf8Bytes")&&text.toUtf8().size()>s.value("x-maxUtf8Bytes").toInt())return false;
  if(s.contains("pattern")&&!QRegularExpression(s.value("pattern").toString()).match(text).hasMatch())return false;
 }else if(type=="boolean"&&!v.isBool())return false;
 else if(type=="null"&&!v.isNull())return false;
 else if(type=="number"||type=="integer"){if(!v.isDouble())return false;const auto n=v.toDouble();if(type=="integer"&&std::floor(n)!=n)return false;if(s.contains("minimum")&&n<s.value("minimum").toDouble())return false;if(s.contains("maximum")&&n>s.value("maximum").toDouble())return false;}
 return true;
}
inline QJsonObject requestSchema(){return QJsonDocument::fromJson(R"tilde(${JSON.stringify(req)})tilde").object();}
inline QJsonObject serverSchema(){return QJsonDocument::fromJson(R"tilde(${JSON.stringify(server)})tilde").object();}
inline bool validateRequest(const QJsonValue &v){static const auto s=requestSchema();return check(s,v);}
inline bool validateServerFrame(const QJsonValue &v){static const auto s=serverSchema();return check(s,v);}
${version>=3?`inline bool validatePayloadManifest(const QJsonValue &v){static const auto s=QJsonDocument::fromJson(R"tilde(${JSON.stringify(payloadManifestSchema)})tilde").object();return check(s,v);}`:''}
inline bool decode(const QByteArray &bytes,QJsonObject &out,bool request){
 if(bytes.size()>MaxFrame)return false;QStringDecoder decoder(QStringDecoder::Utf8);decoder.decode(bytes);if(decoder.hasError())return false;
 QJsonParseError error;const auto d=QJsonDocument::fromJson(bytes,&error);if(error.error!=QJsonParseError::NoError||!d.isObject())return false;
 out=d.object();return request?validateRequest(out):validateServerFrame(out);
}
}\n`;
 return version===4?'#ifndef Q_MOC_RUN\n'+header+'#endif\n':header;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const out=new URL('../.build/',import.meta.url);await mkdir(out,{recursive:true});
 await writeFile(new URL('protocol-v1.hpp',out),generateHeader().replace('namespace TildeProtocol {','namespace TildeProtocolV1 {'));
 await writeFile(new URL('protocol.hpp',out),generateHeader(undefined,4).replace('namespace TildeProtocolV4 {','namespace TildeProtocol {'));
 await writeFile(new URL('protocol-v2.hpp',out),generateHeader(undefined,2));
 await writeFile(new URL('protocol-v3.hpp',out),generateHeader(undefined,3));
 await writeFile(new URL('protocol-v4.hpp',out),generateHeader(undefined,4));
 await writeFile(new URL('wire-v4-schema.json',out),JSON.stringify({request:v4RequestSchema,server:v4ServerSchema},null,2)+'\n');
 await writeFile(new URL('wire-v3-schema.json',out),JSON.stringify({request:v3RequestSchema,server:v3ServerSchema},null,2)+'\n');
 await writeFile(new URL('wire-v2-schema.json',out),JSON.stringify({request:v2RequestSchema,server:v2ServerSchema},null,2)+'\n');
 await writeFile(new URL('wire-schema.json',out),JSON.stringify({request:v4RequestSchema,server:v4ServerSchema},null,2)+'\n');
}
