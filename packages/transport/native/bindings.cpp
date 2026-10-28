#define NAPI_VERSION 8
#include <node_api.h>
#include <uv.h>
#include "peer.h"
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>
#include <cerrno>
#include <cstring>
#include <vector>
#include <set>
#include <memory>
#include <string>
namespace {
struct Endpoint;
struct State {std::set<Endpoint*> clients;};
struct Endpoint {
 napi_env env;uv_poll_t poll{};tilde::OwnedFd fd;napi_ref self=nullptr,read=nullptr,end=nullptr,writeCb=nullptr,accept=nullptr;
 std::vector<char> output;size_t offset=0;bool listener=false,paused=true,closing=false,uvClosed=false,finalized=false;
 std::shared_ptr<State> state;tilde::Peer peer{};
 Endpoint(napi_env e,int f,bool l,std::shared_ptr<State> s):env(e),fd(f),listener(l),state(std::move(s)){}
};
napi_value undefined(napi_env e){napi_value v;napi_get_undefined(e,&v);return v;}
napi_value error(napi_env e,const char *code){napi_value text,result;napi_create_string_utf8(e,code,NAPI_AUTO_LENGTH,&text);napi_create_error(e,nullptr,text,&result);return result;}
void call(Endpoint *p,napi_ref ref,size_t count,napi_value *args){if(!ref)return;napi_value fn;napi_get_reference_value(p->env,ref,&fn);napi_call_function(p->env,undefined(p->env),fn,count,args,nullptr);}
void drop(napi_env e,napi_ref &r){if(r){napi_delete_reference(e,r);r=nullptr;}}
void finishWrite(Endpoint *p,const char *code=nullptr){
 auto callback=p->writeCb;p->writeCb=nullptr;p->output.clear();p->offset=0;
 if(callback){napi_value argument=code?error(p->env,code):undefined(p->env);call(p,callback,1,&argument);napi_delete_reference(p->env,callback);}
}
void stop(Endpoint *p,const char *code=nullptr){
 if(p->closing)return;
 p->closing=true;
 uv_poll_stop(&p->poll);p->fd.close();
 if(p->listener){auto clients=p->state->clients;for(auto *client:clients)stop(client,"LISTENER_CLOSED");}
 else p->state->clients.erase(p);
 finishWrite(p,"CONNECTION_CLOSED");
 if(p->end){napi_value argument=code?error(p->env,code):undefined(p->env);call(p,p->end,1,&argument);}
 drop(p->env,p->read);drop(p->env,p->end);drop(p->env,p->accept);drop(p->env,p->self);
 uv_close(reinterpret_cast<uv_handle_t*>(&p->poll),[](uv_handle_t *handle){auto *p=static_cast<Endpoint*>(handle->data);p->uvClosed=true;if(p->finalized)delete p;});
}
void poll(uv_poll_t *handle,int status,int events);
void update(Endpoint *p){
 if(p->closing)return;
 int events=p->listener?UV_READABLE:(!p->paused&&p->read?UV_READABLE:0);
 if(p->writeCb)events|=UV_WRITABLE;
 if(events){if(uv_poll_start(&p->poll,events,poll)<0)stop(p,"POLL_FAILED");}else uv_poll_stop(&p->poll);
}
Endpoint *unwrap(napi_env env,napi_callback_info info,size_t count,napi_value *args){napi_value object;napi_get_cb_info(env,info,&count,args,&object,nullptr);Endpoint *p=nullptr;napi_unwrap(env,object,reinterpret_cast<void**>(&p));return p;}
napi_value closeMethod(napi_env e,napi_callback_info i){auto *p=unwrap(e,i,0,nullptr);if(p)stop(p);return undefined(e);}
napi_value pauseMethod(napi_env e,napi_callback_info i){napi_value args[1];auto *p=unwrap(e,i,1,args);bool paused=true;napi_get_value_bool(e,args[0],&paused);if(p&&!p->closing){p->paused=paused;update(p);}return undefined(e);}
napi_value startMethod(napi_env e,napi_callback_info i){napi_value args[2];auto *p=unwrap(e,i,2,args);if(p&&!p->closing){drop(e,p->read);drop(e,p->end);napi_create_reference(e,args[0],1,&p->read);napi_create_reference(e,args[1],1,&p->end);p->paused=false;update(p);}return undefined(e);}
void flush(Endpoint *p){
 while(p->writeCb&&p->offset<p->output.size()){
  auto n=::send(p->fd.get(),p->output.data()+p->offset,p->output.size()-p->offset,MSG_NOSIGNAL);
  if(n>0){p->offset+=static_cast<size_t>(n);continue;}
  if(n<0&&errno==EINTR)continue;
  if(n<0&&(errno==EAGAIN||errno==EWOULDBLOCK))return;
  stop(p,"WRITE_FAILED");return;
 }
 if(p->writeCb)finishWrite(p);
}
napi_value writeMethod(napi_env e,napi_callback_info i){
 napi_value args[2];auto *p=unwrap(e,i,2,args);void *bytes=nullptr;size_t length=0;
 if(!p)return undefined(e);
 if(napi_get_buffer_info(e,args[0],&bytes,&length)!=napi_ok||length>1048576||p->writeCb||p->closing){napi_throw_error(e,nullptr,"NATIVE_WRITE_REJECTED");return nullptr;}
 p->output.assign(static_cast<char*>(bytes),static_cast<char*>(bytes)+length);p->offset=0;napi_create_reference(e,args[1],1,&p->writeCb);flush(p);update(p);return undefined(e);
}
napi_value wrap(Endpoint *p){
 napi_value object;napi_create_object(p->env,&object);
 napi_property_descriptor methods[]={
 {"close",nullptr,closeMethod,nullptr,nullptr,nullptr,napi_default,nullptr},
 {"pause",nullptr,pauseMethod,nullptr,nullptr,nullptr,napi_default,nullptr},
 {"start",nullptr,startMethod,nullptr,nullptr,nullptr,napi_default,nullptr},
 {"write",nullptr,writeMethod,nullptr,nullptr,nullptr,napi_default,nullptr}};
 napi_define_properties(p->env,object,4,methods);
 napi_wrap(p->env,object,p,[](napi_env,void *data,void*){auto *p=static_cast<Endpoint*>(data);p->finalized=true;if(p->uvClosed)delete p;else stop(p);},nullptr,nullptr);
 napi_create_reference(p->env,object,1,&p->self);return object;
}
void poll(uv_poll_t *handle,int status,int events){
 auto *p=static_cast<Endpoint*>(handle->data);napi_handle_scope scope;napi_open_handle_scope(p->env,&scope);
 if(status<0){stop(p,"POLL_FAILED");napi_close_handle_scope(p->env,scope);return;}
 if(p->listener){
  for(int i=0;i<16&&!p->closing;i++){
   int fd=accept4(p->fd.get(),nullptr,nullptr,SOCK_NONBLOCK|SOCK_CLOEXEC);
   if(fd<0){if(errno==EINTR){i--;continue;}break;}
   auto *client=new Endpoint(p->env,fd,false,p->state);
   if(p->state->clients.size()>=8||!tilde::authenticate(client->fd,geteuid(),client->peer)){delete client;continue;}
   uv_loop_t *loop; napi_get_uv_event_loop(p->env,&loop);
   if(uv_poll_init_socket(loop,&client->poll,fd)<0){delete client;continue;}client->poll.data=client;
   p->state->clients.insert(client);
   napi_value args[4];args[0]=wrap(client);napi_create_uint32(p->env,client->peer.uid,&args[1]);napi_create_int32(p->env,client->peer.pid,&args[2]);napi_create_uint32(p->env,client->peer.gid,&args[3]);call(p,p->accept,4,args);
  }
 }else{
  if(events&UV_WRITABLE)flush(p);
  if(!p->closing&&!p->paused&&(events&UV_READABLE)){
   char buffer[16384];ssize_t n;do{n=::recv(p->fd.get(),buffer,sizeof(buffer),0);}while(n<0&&errno==EINTR);
   if(n>0){napi_value data;napi_create_buffer_copy(p->env,static_cast<size_t>(n),buffer,nullptr,&data);call(p,p->read,1,&data);}
   else if(n==0)stop(p);
   else if(errno!=EAGAIN&&errno!=EWOULDBLOCK)stop(p,"READ_FAILED");
  }
  update(p);
 }
 napi_close_handle_scope(p->env,scope);
}
napi_value listenMethod(napi_env env,napi_callback_info info){
 napi_value args[2];size_t argc=2;napi_get_cb_info(env,info,&argc,args,nullptr,nullptr);size_t length=0;napi_get_value_string_utf8(env,args[0],nullptr,0,&length);
 if(!length||length>=sizeof(sockaddr_un::sun_path)){napi_throw_error(env,nullptr,"SOCKET_PATH_TOO_LONG");return nullptr;}
 std::vector<char> path(length+1);napi_get_value_string_utf8(env,args[0],path.data(),path.size(),&length);
 int fd=socket(AF_UNIX,SOCK_STREAM|SOCK_NONBLOCK|SOCK_CLOEXEC,0);if(fd<0){napi_throw_error(env,nullptr,"SOCKET_FAILED");return nullptr;}
 auto *p=new Endpoint(env,fd,true,std::make_shared<State>());sockaddr_un address{};address.sun_family=AF_UNIX;std::memcpy(address.sun_path,path.data(),length+1);
 if(bind(fd,reinterpret_cast<sockaddr*>(&address),sizeof(address))<0||listen(fd,8)<0){delete p;napi_throw_error(env,nullptr,"SOCKET_BIND_FAILED");return nullptr;}
 uv_loop_t *loop;napi_get_uv_event_loop(env,&loop);if(uv_poll_init_socket(loop,&p->poll,fd)<0){delete p;napi_throw_error(env,nullptr,"POLL_INIT_FAILED");return nullptr;}
 p->poll.data=p;napi_create_reference(env,args[1],1,&p->accept);auto object=wrap(p);update(p);return object;
}
napi_value init(napi_env env,napi_value exports){napi_value listen;napi_create_function(env,"listen",NAPI_AUTO_LENGTH,listenMethod,nullptr,&listen);napi_set_named_property(env,exports,"listen",listen);return exports;}
}
NAPI_MODULE(NODE_GYP_MODULE_NAME,init)
