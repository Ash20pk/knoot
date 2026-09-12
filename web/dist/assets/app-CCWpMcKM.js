import"./modulepreload-polyfill-P2Xu9kJm.js";import{i as e,r as t,t as n}from"./relay-CtT8-rE5.js";var r;(function(e){e.Any=`any`,e.ApNortheast1=`ap-northeast-1`,e.ApNortheast2=`ap-northeast-2`,e.ApSouth1=`ap-south-1`,e.ApSoutheast1=`ap-southeast-1`,e.ApSoutheast2=`ap-southeast-2`,e.CaCentral1=`ca-central-1`,e.EuCentral1=`eu-central-1`,e.EuWest1=`eu-west-1`,e.EuWest2=`eu-west-2`,e.EuWest3=`eu-west-3`,e.SaEast1=`sa-east-1`,e.UsEast1=`us-east-1`,e.UsWest1=`us-west-1`,e.UsWest2=`us-west-2`})(r||={});var i;(function(e){e.abstime=`abstime`,e.bool=`bool`,e.date=`date`,e.daterange=`daterange`,e.float4=`float4`,e.float8=`float8`,e.int2=`int2`,e.int4=`int4`,e.int4range=`int4range`,e.int8=`int8`,e.int8range=`int8range`,e.json=`json`,e.jsonb=`jsonb`,e.money=`money`,e.numeric=`numeric`,e.oid=`oid`,e.reltime=`reltime`,e.text=`text`,e.time=`time`,e.timestamp=`timestamp`,e.timestamptz=`timestamptz`,e.timetz=`timetz`,e.tsrange=`tsrange`,e.tstzrange=`tstzrange`})(i||={});var a=(e,t)=>{if(e.charAt(0)===`_`)return te(t,e.slice(1,e.length));switch(e){case i.bool:return s(t);case i.float4:case i.float8:case i.int2:case i.int4:case i.int8:case i.numeric:case i.oid:return c(t);case i.json:case i.jsonb:return ee(t);case i.timestamp:return ne(t);case i.abstime:case i.date:case i.daterange:case i.int4range:case i.int8range:case i.money:case i.reltime:case i.text:case i.time:case i.timestamptz:case i.timetz:case i.tsrange:case i.tstzrange:return o(t);default:return o(t)}},o=e=>e,s=e=>{switch(e){case`t`:return!0;case`f`:return!1;default:return e}},c=e=>{if(typeof e==`string`){let t=parseFloat(e);if(!Number.isNaN(t))return t}return e},ee=e=>{if(typeof e==`string`)try{return JSON.parse(e)}catch{return e}return e},te=(e,t)=>{if(typeof e!=`string`)return e;let n=e.length-1,r=e[n];if(e[0]===`{`&&r===`}`){let r,i=e.slice(1,n);try{r=JSON.parse(`[`+i+`]`)}catch{r=i?i.split(`,`):[]}return r.map(e=>a(t,e))}return e},ne=e=>typeof e==`string`?e.replace(` `,`T`):e,re;(function(e){e.SYNC=`sync`,e.JOIN=`join`,e.LEAVE=`leave`})(re||={});var ie;(function(e){e.ALL=`*`,e.INSERT=`INSERT`,e.UPDATE=`UPDATE`,e.DELETE=`DELETE`})(ie||={});var ae;(function(e){e.BROADCAST=`broadcast`,e.PRESENCE=`presence`,e.POSTGRES_CHANGES=`postgres_changes`,e.SYSTEM=`system`})(ae||={});var oe;(function(e){e.SUBSCRIBED=`SUBSCRIBED`,e.TIMED_OUT=`TIMED_OUT`,e.CLOSED=`CLOSED`,e.CHANNEL_ERROR=`CHANNEL_ERROR`})(oe||={});function l(e){"@babel/helpers - typeof";return l=typeof Symbol==`function`&&typeof Symbol.iterator==`symbol`?function(e){return typeof e}:function(e){return e&&typeof Symbol==`function`&&e.constructor===Symbol&&e!==Symbol.prototype?`symbol`:typeof e},l(e)}function se(e,t){if(l(e)!=`object`||!e)return e;var n=e[Symbol.toPrimitive];if(n!==void 0){var r=n.call(e,t||`default`);if(l(r)!=`object`)return r;throw TypeError(`@@toPrimitive must return a primitive value.`)}return(t===`string`?String:Number)(e)}function ce(e){var t=se(e,`string`);return l(t)==`symbol`?t:t+``}function le(e,t,n){return(t=ce(t))in e?Object.defineProperty(e,t,{value:n,enumerable:!0,configurable:!0,writable:!0}):e[t]=n,e}function u(e,t){var n=Object.keys(e);if(Object.getOwnPropertySymbols){var r=Object.getOwnPropertySymbols(e);t&&(r=r.filter(function(t){return Object.getOwnPropertyDescriptor(e,t).enumerable})),n.push.apply(n,r)}return n}function d(e){for(var t=1;t<arguments.length;t++){var n=arguments[t]==null?{}:arguments[t];t%2?u(Object(n),!0).forEach(function(t){le(e,t,n[t])}):Object.getOwnPropertyDescriptors?Object.defineProperties(e,Object.getOwnPropertyDescriptors(n)):u(Object(n)).forEach(function(t){Object.defineProperty(e,t,Object.getOwnPropertyDescriptor(n,t))})}return e}var f=class extends Error{constructor(e,t=`storage`,n,r){super(e),this.__isStorageError=!0,this.namespace=t,this.name=t===`vectors`?`StorageVectorsError`:`StorageError`,this.status=n,this.statusCode=r}toJSON(){return{name:this.name,message:this.message,status:this.status,statusCode:this.statusCode}}},p=class extends f{constructor(e,t,n,r=`storage`,i){super(e,r,t,n),this.name=r===`vectors`?`StorageVectorsApiError`:`StorageApiError`,this.status=t,this.statusCode=n,this.code=i}toJSON(){return d(d({},super.toJSON()),{},{code:this.code})}},ue=class extends f{constructor(e,t,n=`storage`){super(e,n),this.name=n===`vectors`?`StorageVectorsUnknownError`:`StorageUnknownError`,this.originalError=t}};function de(e,t,n){let r=d({},e),i=t.toLowerCase();for(let e of Object.keys(r))e.toLowerCase()===i&&delete r[e];return r[i]=n,r}var fe=e=>{if(typeof e!=`object`||!e)return!1;let t=Object.getPrototypeOf(e);return(t===null||t===Object.prototype||Object.getPrototypeOf(t)===null)&&!(Symbol.toStringTag in e)&&!(Symbol.iterator in e)},m=e=>{if(typeof e==`object`&&e){let t=e;if(typeof t.msg==`string`)return t.msg;if(typeof t.message==`string`)return t.message;if(typeof t.error_description==`string`)return t.error_description;if(typeof t.error==`string`)return t.error;if(typeof t.error==`object`&&t.error!==null){let e=t.error;if(typeof e.message==`string`)return e.message}}return JSON.stringify(e)},pe=async(e,t,n,r)=>{if(typeof e==`object`&&e&&`json`in e&&typeof e.json==`function`){let n=e,i=parseInt(String(n.status),10);Number.isFinite(i)||(i=500),n.json().then(e=>{let n=e?.statusCode||e?.code||i+``;t(new p(m(e),i,n,r,e?.code))}).catch(()=>{let e=i+``;t(new p(n.statusText||`HTTP ${i} error`,i,e,r))})}else t(new ue(m(e),e,r))},me=(e,t,n,r)=>{let i={method:e,headers:t?.headers||{}};if(e===`GET`||e===`HEAD`||!r)return d(d({},i),n);if(fe(r)){let e=t?.headers||{},n;for(let[t,r]of Object.entries(e))t.toLowerCase()===`content-type`&&(n=r);i.headers=de(e,`Content-Type`,n??`application/json`),i.body=JSON.stringify(r)}else i.body=r;return t?.duplex&&(i.duplex=t.duplex),d(d({},i),n)};async function h(e,t,n,r,i,a,o){return new Promise((s,c)=>{e(n,me(t,r,i,a)).then(e=>{if(!e.ok)throw e;if(r?.noResolveJson)return e;if(o===`vectors`){let t=e.headers.get(`content-type`);if(e.headers.get(`content-length`)===`0`||e.status===204||!t||!t.includes(`application/json`))return{}}return e.json()}).then(e=>s(e)).catch(e=>pe(e,c,r,o))})}function he(e=`storage`){return{get:async(t,n,r,i)=>h(t,`GET`,n,r,i,void 0,e),post:async(t,n,r,i,a)=>h(t,`POST`,n,i,a,r,e),put:async(t,n,r,i,a)=>h(t,`PUT`,n,i,a,r,e),head:async(t,n,r,i)=>h(t,`HEAD`,n,d(d({},r),{},{noResolveJson:!0}),i,void 0,e),remove:async(t,n,r,i,a)=>h(t,`DELETE`,n,i,a,r,e)}}var{get:ge,post:_e,put:ve,head:ye,remove:be}=he(`storage`),xe=`2.114.0`,g=3e4;3*g,2*g,`${xe}`;var _=`ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_`.split(``),v=` 	
\r=`.split(``);(()=>{let e=Array(128);for(let t=0;t<e.length;t+=1)e[t]=-1;for(let t=0;t<v.length;t+=1)e[v[t].charCodeAt(0)]=-2;for(let t=0;t<_.length;t+=1)e[_[t].charCodeAt(0)]=t;return e})();var Se=()=>typeof window<`u`&&typeof document<`u`,y={tested:!1,writable:!1};globalThis&&(()=>{if(!Se())return!1;try{if(typeof globalThis.localStorage!=`object`)return!1}catch{return!1}if(y.tested)return y.writable;let e=`lswt-${Math.random()}${Math.random()}`;try{globalThis.localStorage.setItem(e,e),globalThis.localStorage.removeItem(e),y.tested=!0,y.writable=!0}catch{y.tested=!0,y.writable=!1}return y.writable})()&&globalThis.localStorage&&globalThis.localStorage.getItem(`supabase.gotrue-js.locks.debug`);function Ce(){if(typeof globalThis!=`object`)try{Object.defineProperty(Object.prototype,"__magic__",{get:function(){return this},configurable:!0}),__magic__.globalThis=__magic__,delete Object.prototype.__magic__}catch{typeof self<`u`&&(self.globalThis=self)}}new class{createNewAbortSignal(){if(this.controller){let e=Error(`Cancelling existing WebAuthn API call for new one`);e.name=`AbortError`,this.controller.abort(e)}let e=new AbortController;return this.controller=e,e.signal}cancelCeremony(){if(this.controller){let e=Error(`Manually cancelling existing WebAuthn API call`);e.name=`AbortError`,this.controller.abort(e),this.controller=void 0}}},Ce();var we=`2.114.0`,b=``,x;if(typeof Deno<`u`)b=`deno`,x=Deno.version?.deno;else if(typeof document<`u`)b=`web`;else if(typeof navigator<`u`&&navigator.product===`ReactNative`)b=`react-native`;else{var S;b=`node`;let e=globalThis.process;x=e==null||(S=e.version)==null?void 0:S.replace(/^v/,``)}var C=[`runtime=${b}`];x&&C.push(`runtime-version=${x}`),`${we}${C.join(`; `)}`;function Te(){if(typeof window<`u`||globalThis.Deno!==void 0)return!1;let e=globalThis.process;if(!e)return!1;let t=e.version;if(t==null)return!1;let n=t.match(/^v(\d+)\./);return n?parseInt(n[1],10)<=20:!1}Te()&&console.warn(`⚠️  Node.js 20 and below are deprecated and will no longer be supported in future versions of @supabase/supabase-js. Please upgrade to Node.js 22 or later. For more information, visit: https://github.com/orgs/supabase/discussions/45715`);var w=null;function T(){throw Error(`Sign-in is not configured on this deployment.`)}async function Ee(e){let{data:t,error:n}=await T().rpc(`create_team`,{team_name:e});if(n)throw Error(n.message);return t}async function De(e,t=`member`){let{data:n,error:r}=await T().rpc(`invite_member`,{invite_email:e,invite_role:t});if(r)throw Error(r.message);return n}async function Oe(){let{data:e,error:t}=await T().from(`invites`).select(`id, email, role, created_at, expires_at`).is(`accepted_at`,null).order(`created_at`);if(t)throw Error(t.message);return e??[]}async function ke(e){let{error:t}=await T().rpc(`revoke_invite`,{invite_id:e});if(t)throw Error(t.message)}async function E(){throw Error(`Sign-in is not configured on this deployment.`)}async function D(e,t={}){let n={Authorization:`Bearer ${await E()}`};t.body&&(n[`Content-Type`]=`application/json`);let r=await fetch(e,{...t,headers:{...n,...t.headers}}),i=await r.json().catch(()=>({}));if(!r.ok)throw Error(i.error||`${r.status} ${r.statusText}`);return i}async function Ae(){let e=await E();return new WebSocket(`${n}?token=${encodeURIComponent(e)}`)}var je=class{onEvent;onState;onConn;claims=[];sessions=new Map;events=[];ws=null;gen=0;repo=null;stopped=!1;constructor(e,t,n){this.onEvent=e,this.onState=t,this.onConn=n}async open(e){let t=++this.gen;this.repo=e,this.close(!1),this.claims=[],this.sessions.clear(),this.events=[];try{let n=await D(`/api/events?repo=${encodeURIComponent(e)}&limit=300`);if(t!==this.gen)return;this.events=n}catch{}this.onState();let n;try{n=await Ae()}catch{this.onConn(!1);return}if(t!==this.gen){n.close();return}this.ws=n,n.onopen=()=>{if(t!==this.gen){n.close();return}this.onConn(!0),n.send(JSON.stringify({type:`hello`,repo:e,daemon:`console`}))},n.onmessage=e=>{if(t!==this.gen)return;let n;try{n=JSON.parse(e.data)}catch{return}n.type===`welcome`?(this.claims=n.claims??[],this.sessions=new Map((n.sessions??[]).map(e=>[e.session,e])),this.onState()):n.type===`event`&&n.event&&(this.apply(n.event),this.events.push(n.event),this.events.length>500&&this.events.shift(),this.onEvent(n.event),this.onState())},n.onerror=()=>{t===this.gen&&this.onConn(!1)},n.onclose=()=>{t!==this.gen||this.stopped||(this.onConn(!1),setTimeout(()=>{t===this.gen&&this.repo&&!this.stopped&&this.open(this.repo)},3e3))}}close(e=!0){if(e&&(this.stopped=!0,this.gen++),this.ws){try{this.ws.close()}catch{}this.ws=null}}apply(e){switch(e.type){case`claim_acquired`:this.claims=this.claims.filter(t=>t.path!==e.path),this.claims.push({session:e.session,user:e.user,path:e.path,intent:e.intent,lease_until:e.lease_until});break;case`claim_released`:case`path_freed`:this.claims=this.claims.filter(t=>t.path!==e.path);break;case`session_started`:this.sessions.set(e.session,{session:e.session,user:e.user,branch:e.branch,intent:``});break;case`intent_declared`:{let t=this.sessions.get(e.session);t&&(t.intent=e.text??``);break}case`session_ended`:this.sessions.delete(e.session),this.claims=this.claims.filter(t=>t.session!==e.session)}}},Me={claim_acquired:`held`,claim_denied:`blocked`,claim_released:`plain`,path_freed:`wire`,message:`wire`,ungated_write:`warn`,cross_branch_overlap:`warn`,create_collision:`blocked`,duplicate_intent:`blocked`,stale_read:`warn`,path_removed:`warn`};function Ne(e){switch(e.type){case`claim_denied`:return`${e.path}, held by ${e.holder_user??`unknown`}`;case`ungated_write`:return`${e.path}, over ${e.holder_user??`a peer`}’s claim`;case`intent_declared`:return`“${e.text??``}”`;case`message`:return`to ${e.to??`all`}: ${e.text??``}`;case`session_started`:return`joined on ${e.branch??`unknown branch`}`;case`session_ended`:return`left`;case`stale_read`:return`${e.path}, read before ${e.peer_user??`a peer`} changed it`;case`create_collision`:return`${e.path}, already created by ${e.peer_user??`a peer`}`;case`duplicate_intent`:return`same task as ${e.peer_user??`a peer`}: “${e.peer_text??``}”`;case`path_removed`:return`${e.path} ${e.moved?`moved away`:`deleted`}`;default:return e.path??``}}var O=e=>{if(!e)return`never`;let t=Date.now()-e;return t<6e4?`just now`:t<36e5?`${Math.floor(t/6e4)} min ago`:t<864e5?`${Math.floor(t/36e5)} h ago`:`${Math.floor(t/864e5)} d ago`},k=(e,t=document)=>t.querySelector(e),Pe=k(`#auth`),A=k(`#shell`),Fe=k(`#booting`),j=k(`#view`),M=null,N=`member`,P=null,F=null,I=null,L=`knoot.pendingTeam`,Ie=e=>{try{e&&localStorage.setItem(L,e)}catch{}},Le=()=>{try{let e=localStorage.getItem(L);return localStorage.removeItem(L),e}catch{return null}},R=location.hash===`#signup`?`signup`:`signin`;function z(){let e=R===`signup`;k(`#auth-title`).textContent=e?`Create your account`:`Sign in`,k(`#auth-sub`).textContent=e?`A team, an agent token, and a live log of every session. No card needed.`:`Manage your team, agent tokens and live sessions.`,k(`#auth-go`).textContent=e?`Create account`:`Sign in`,k(`#auth-switch`).textContent=e?`I already have an account`:`Create an account`,k(`#team-field`).hidden=!e,k(`#auth-team`).required=e,k(`#auth-password`).autocomplete=e?`new-password`:`current-password`}function B(e,t=``){let n=k(`#auth-err`),r=k(`#auth-ok`);n.hidden=e!==`err`,r.hidden=e!==`ok`,e===`err`&&(n.textContent=t),e===`ok`&&(r.textContent=t)}function V(){Fe.hidden=!0,A.hidden=!0,Pe.hidden=!1,z(),B(`err`,`Sign-in is not configured on this deployment. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY at build time, or run your own relay and use an agent token.`),k(`#auth-go`).disabled=!0}k(`#auth-switch`).addEventListener(`click`,()=>{R=R===`signup`?`signin`:`signup`,location.hash=R===`signup`?`#signup`:``,B(`clear`),z()}),k(`#auth-reset`).addEventListener(`click`,async()=>{let e=k(`#auth-email`).value.trim();if(!e){B(`err`,`Enter your email address first, then choose Forgot password.`);return}try{let{error:t}=await w.auth.resetPasswordForEmail(e,{redirectTo:`${location.origin}/app/`});if(t)throw Error(t.message);B(`ok`,`Check ${e} for a link to set a new password.`)}catch(e){B(`err`,e.message)}}),k(`#auth-form`).addEventListener(`submit`,async e=>{e.preventDefault();let t=k(`#auth-go`),n=k(`#auth-email`).value.trim(),r=k(`#auth-password`).value,i=k(`#auth-team`).value.trim();B(`clear`),t.disabled=!0,t.textContent=R===`signup`?`Creating account`:`Signing in`;try{let e=w;if(R===`signup`){let{data:t,error:a}=await e.auth.signUp({email:n,password:r});if(a){if(/already|registered|exists/i.test(a.message)){R=`signin`,location.hash=``,z(),B(`ok`,`${n} already has an account. Sign in with its password, or choose Forgot password.`),k(`#auth-password`).focus();return}throw Error(a.message)}if(Ie(i),!t.session){B(`ok`,`Check ${n} to confirm your address, then sign in. Your team is created when you first sign in.`),R=`signin`,z();return}await Ee(i||`${n.split(`@`)[0]}'s team`),Le()}else{let{error:t}=await e.auth.signInWithPassword({email:n,password:r});if(t)throw Error(t.message)}await Je()}catch(e){B(`err`,e.message)}finally{t.disabled=!1,z()}}),k(`#signout`).addEventListener(`click`,async()=>{F?.close(),await w?.auth.signOut(),M=null,location.hash=``,V()});var Re=[`start`,`sessions`,`repositories`,`tokens`,`rooms`,`team`,`settings`],ze=()=>!!P?.repos?.length;function H(){let e=location.hash.replace(`#`,``);return Re.includes(e)?e:ze()?`sessions`:`start`}function U(){let e=H();for(let t of document.querySelectorAll(`.tabs a`))t.classList.toggle(`on`,t.getAttribute(`href`)===`#${e}`);k(`#tab-start`)?.classList.toggle(`done`,q().current===0)}function W(){switch(U(),F?.close(),F=null,K(),H()){case`start`:return Ve();case`sessions`:return Be();case`repositories`:return Ge();case`tokens`:return Z();case`rooms`:return Q();case`team`:return Ke();case`settings`:return qe()}}function Be(){let e=P?.repos??[];if(!e.length){J(`Sessions`,`Every agent currently working a repository your team has connected, and the event log behind them.`,`The log fills in on its own the moment a daemon on an enrolled repository reaches the relay.`);return}j.innerHTML=`
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Sessions</h1>
          <p>Every agent currently working a repository your team has connected, and the event log behind them.</p>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head">
          <h2>Live</h2>
          ${e.length?`<select class="picker" id="repo-pick" aria-label="Repository">${e.map(e=>`<option value="${t(e.repo)}">${t(e.repo)}</option>`).join(``)}</select>`:``}
          <span class="state" id="conn">idle</span>
          <div class="right"><div class="counts" id="counts"></div></div>
        </div>
        <div id="presence"></div>
        <div class="log" id="log">
          <div class="row h"><span>time</span><span>agent</span><span>event</span><span>detail</span></div>
          <div id="log-rows"></div>
        </div>
      </div>
    </div>`;let n=k(`#repo-pick`);I&&e.some(e=>e.repo===I)&&(n.value=I),I=n.value,n.addEventListener(`change`,()=>{I=n.value,Y()}),Y()}var G=null;function K(){G&&=(clearInterval(G),null)}function q(){let e=(P?.tokens??[]).filter(e=>!e.revoked).length,t=P?.repos?.length??0,n=(P?.members??[]).filter(e=>!e.unassigned).length,r=[e>0,e>0,t>0,t>0,n>1],i=r.filter(Boolean).length;return{keys:e,repos:t,people:n,current:r.indexOf(!1)+1,done:i}}function J(e,n,r){j.innerHTML=`
    <div class="page">
      <div class="page-head"><div><h1>${t(e)}</h1><p>${t(n)}</p></div></div>
      <div class="panel">
        <div class="panel-body not-yet">
          <p>Nothing is connected yet. ${t(r)}</p>
          <a class="btn" href="#start">Get started</a>
        </div>
      </div>
    </div>`}function Ve(){let r=q(),i=(e,n=``)=>`<div class="cmd-row"${n?` id="${n}"`:``}><code>${t(e)}</code><button class="copy" type="button">Copy</button></div>`,a=(e,t)=>`step${t?` done`:e===r.current?` now`:` later`}`,o=r.current===0;j.innerHTML=`
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Get started</h1>
          <p>${o?`Everything is connected. The live log under Sessions is where the team shows up from here on.`:`Five steps take a team from nothing to a shared log of every agent session. The console watches the relay and ticks each one off as it happens.`}</p>
        </div>
        <div class="actions">${o?`<a class="btn" href="#sessions">Open sessions</a>`:``}</div>
      </div>
      <div class="panel setup">
        <div class="panel-head">
          <h2>${r.done} of 5 done</h2>
          <div class="right">${r.repos?`<span class="state live">${r.repos} repositor${r.repos===1?`y`:`ies`} connected</span>`:`<span class="state waiting" id="setup-wait"><i></i>waiting for a daemon to reach the relay</span>`}</div>
        </div>
        <div class="panel-body">
          <ol class="steps">
            <li class="${a(1,r.keys>0)}">
              <div class="n">1</div>
              <div class="body">
                <h3>Install knoot on the machine where agents run</h3>
                <p>One binary. It is the hook, the daemon and the CLI.</p>
                ${i(`cargo install --git https://github.com/Ash20pk/knoot`)}
              </div>
            </li>
            <li class="${a(2,r.keys>0)}" id="step-key">
              <div class="n">2</div>
              <div class="body">
                <h3>Mint a key for that machine</h3>
                <p>${r.keys?`You have ${r.keys} live key${r.keys===1?``:`s`}. Use one you saved, or mint another for this machine.`:`A key names one machine and one person. It is shown once, so keep this tab open until step 3 is done.`}</p>
                <div class="inline-form">
                  <input id="setup-label" maxlength="40" placeholder="Label, such as laptop or ci" value="laptop">
                  <button class="btn${r.keys?` quiet`:``}" id="setup-mint">${r.keys?`Mint another`:`Mint key`}</button>
                </div>
                <div id="setup-key"></div>
                <div class="err" id="setup-err" hidden></div>
              </div>
            </li>
            <li class="${a(3,r.repos>0)}">
              <div class="n">3</div>
              <div class="body">
                <h3>Enrol the repository and store the key</h3>
                <p>Run inside the repository. <code>init</code> writes the hook config, which you commit so every clone is enrolled. <code>join</code> checks the key with the relay and stores it for this machine.</p>
                ${i(`knoot init --relay ${n}`)}
                ${i(`knoot join <key> --relay ${n}`,`setup-join`)}
              </div>
            </li>
            <li class="${a(4,r.repos>0)}">
              <div class="n">4</div>
              <div class="body">
                <h3>Start the daemon</h3>
                <p>It answers every hook locally and holds the connection to the relay. Leave it running. ${r.repos?`It has reached the relay; the live log is under Sessions.`:`This page notices the moment it connects.`}</p>
                ${i(`knoot daemon`)}
              </div>
            </li>
            <li class="${a(5,r.people>1)}">
              <div class="n">5</div>
              <div class="body">
                <h3>Bring in the rest of the team</h3>
                <p>${r.people>1?`${r.people} people are on the team. Each one mints their own key under Agent keys, so nothing is ever attributed to the wrong person.`:`Each person gets their own key, so the relay can say who wrote what. Invite them under Team; they mint a key when they sign in.`}</p>
                <a class="btn quiet sm" href="#team">${r.people>1?`Open team`:`Invite a teammate`}</a>
              </div>
            </li>
          </ol>
        </div>
      </div>
      <p class="setup-foot">Prefer to read first? <a href="/docs/">The docs</a> cover the hook contract and what crosses the wire. Only paths and intent sentences do; never code.</p>
    </div>`,e(j),k(`#setup-mint`).addEventListener(`click`,async()=>{let e=k(`#setup-mint`),r=k(`#setup-err`);r.hidden=!0,e.disabled=!0;try{let r=k(`#setup-label`).value.trim()||`laptop`,i=await D(`/api/tokens`,{method:`POST`,body:JSON.stringify({label:r})});k(`#setup-key`).innerHTML=`<div class="reveal">
        <div class="lbl">Your key. This is the only time it is readable; the join command in step 3 now carries it.</div>
        <div class="val">${t(i.token)}</div></div>`,k(`#setup-join`).querySelector(`code`).textContent=`knoot join ${i.token} --relay ${n}`;let a=k(`#step-key`);a.classList.remove(`now`,`later`),a.classList.add(`done`),e.textContent=`Mint another`,e.classList.add(`quiet`),await $(),U()}catch(e){r.textContent=e.message,r.hidden=!1}finally{e.disabled=!1}}),K(),r.repos||(G=setInterval(async()=>{try{await $(),P?.repos?.length&&(I=P.repos[0].repo,W())}catch{}},4e3))}function Y(){let e=k(`#log-rows`),t=k(`#log`);F?.close(),F=new je(n=>Ue(n,e,t),()=>{We(),e.dataset.seeded||He(e,t)},e=>{let t=k(`#conn`);t.textContent=e===!0?`live`:e===!1?`reconnecting`:`idle`,t.className=`state`+(e===!0?` live`:e===!1?` off`:``)}),F.open(I)}function X(e,n){let r=Me[e.type]??`plain`,i=e.ts?new Date(e.ts).toLocaleTimeString([],{hour12:!1}).slice(0,8):``;return`<div class="row${r===`blocked`?` is-blocked`:``}${n?` enter`:``}">
    <span class="t">${t(i)}</span><span class="u">${t(e.user??``)}</span>
    <span class="k ${r}">${t(e.type)}</span><span class="d">${t(Ne(e))}</span></div>`}function He(e,t){let n=F?.events??[];e.innerHTML=n.length?n.slice(-300).map(e=>X(e,!1)).join(``):`<div class="empty">Connected. Nothing has happened in this repository yet.</div>`,e.dataset.seeded=`1`,t.scrollTop=t.scrollHeight}function Ue(e,t,n){let r=n.scrollTop+n.clientHeight>=n.scrollHeight-30;for(t.querySelector(`.empty`)&&(t.innerHTML=``),t.insertAdjacentHTML(`beforeend`,X(e,!0));t.children.length>300;)t.removeChild(t.firstChild);r&&(n.scrollTop=n.scrollHeight)}function We(){let e=k(`#presence`);if(!e||!F)return;let n=[...F.sessions.values()],r=new Set(F.events.slice(-60).filter(e=>e.type===`claim_denied`).map(e=>e.session));e.innerHTML=n.length?`<table class="rows">
        <thead><tr><th>Agent</th><th>Working on</th><th>Holds</th></tr></thead>
        <tbody>${n.map(e=>{let n=F.claims.filter(t=>t.session===e.session).map(e=>e.path),i=r.has(e.session)&&!n.length,a=n.length?`holds`:i?`holds blocked`:`holds none`,o=n.length?n.join(`  `):i?`blocked, waiting`:`nothing`;return`<tr><td class="mono">${t(e.user??e.session.slice(0,8))}</td>
            <td class="dim intent">${t(e.intent||`no stated intent yet`)}</td>
            <td class="${a}">${t(o)}</td></tr>`}).join(``)}</tbody></table>`:``;let i=n.length,a=F.claims.length,o=r.size,s=k(`#counts`);s&&(s.innerHTML=`<span><b>${i}</b>session${i===1?``:`s`}</span><span><b>${a}</b>claim${a===1?``:`s`}</span>`+(o?`<span class="blocked"><b>${o}</b>blocked</span>`:``))}function Ge(){let n=P?.repos??[];if(!n.length){J(`Repositories`,`A repository appears here the first time an agent on it reaches the relay. Nothing to create by hand.`,`Your first one shows up here as soon as its daemon connects.`);return}j.innerHTML=`
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Repositories</h1>
          <p>A repository appears here the first time an agent on it reaches the relay. Nothing to create by hand.</p>
        </div>
      </div>
      <div class="panel">
        <table class="rows">
          <thead><tr><th>Repository</th><th>Last activity</th><th></th></tr></thead>
          <tbody>${n.map(e=>`<tr>
            <td class="mono">${t(e.repo)}</td>
            <td class="dim">${t(O(e.last_seen_ts??null))}</td>
            <td class="right"><a class="btn quiet sm" href="#sessions" data-repo="${t(e.repo)}">Open log</a></td>
          </tr>`).join(``)}</tbody></table>
      </div>
    </div>`;for(let e of j.querySelectorAll(`[data-repo]`))e.addEventListener(`click`,()=>{I=e.dataset.repo});e(j)}function Z(){let r=P?.tokens??[],i=r.filter(e=>!e.revoked).length,a=P?.members??[],o=a.filter(e=>e.unassigned),s=P?.me;j.innerHTML=`
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Agent keys</h1>
          <p>A key belongs to one machine and names one person. That is what lets the relay say who wrote something without taking the agent&rsquo;s word for it &mdash; and what lets one laptop be revoked without touching anybody else. Keys are stored as hashes and can never be shown again.</p>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head"><h2>Tokens</h2><div class="right"><span class="state">${i} live</span></div></div>
        <div class="panel-body">
          <div class="inline-form">
            <input id="mint-label" maxlength="40" placeholder="Label, such as laptop or ci">
            ${(s?.role===`owner`||s?.role===`admin`)&&a.length>1?`<select id="mint-member">
              ${a.filter(e=>!e.unassigned).map(e=>`<option value="${t(e.id)}"${e.id===s?.member_id?` selected`:``}>${t(e.email)}</option>`).join(``)}
            </select>`:``}
            <button class="btn" id="mint-go">Mint key</button>
          </div>
          <div id="mint-out"></div>
          <div class="err" id="tok-err" hidden></div>
        </div>
        ${r.length?`<table class="rows">
          <thead><tr><th>Label</th><th>Belongs to</th><th>Created</th><th>Last used</th><th></th></tr></thead>
          <tbody>${r.map(e=>`<tr>
            <td><span class="${e.revoked?`strike`:``}">${t(e.label||`unlabelled`)}</span>${e.revoked?`<span class="tag dead">revoked</span>`:``}</td>
            <td class="${e.unassigned?`dim`:``}">${e.unassigned?`<span class="tag">unassigned</span>`:t(e.member_email)}</td>
            <td class="dim">${t(O(e.created_ts))}</td>
            <td class="dim">${e.revoked?``:t(O(e.last_seen_ts))}</td>
            <td class="right">${e.revoked?``:`<button class="btn danger sm" data-revoke="${t(e.id)}">Revoke</button>`}</td>
          </tr>`).join(``)}</tbody></table>`:``}
      </div>

      ${o.length?`<div class="panel">
        <div class="panel-head"><h2>Keys with no owner</h2></div>
        <div class="panel-body">
          <p>These were minted before keys named a person, so they still work but nothing they write can be attributed. Attaching one to yourself does not change the key &mdash; the machine using it carries on &mdash; it only records whose it is.</p>
          <table class="rows" style="margin-top:14px">
            <tbody>${o.map(e=>`<tr>
              <td class="mono dim">${t(e.email.replace(`@unassigned.invalid`,``))}</td>
              <td class="right"><button class="btn quiet sm" data-attach="${t(e.id)}">This is mine</button></td>
            </tr>`).join(``)}</tbody></table>
        </div>
      </div>`:``}

      <p class="setup-foot">Putting a key to work on a machine is steps 1 to 4 of <a href="#start">Get started</a>.</p>
    </div>`,e(j),k(`#mint-go`).addEventListener(`click`,async()=>{let r=k(`#mint-go`),i=k(`#tok-err`);i.hidden=!0,r.disabled=!0;try{let r=k(`#mint-label`).value.trim(),i=k(`#mint-member`)?.value,a=await D(`/api/tokens`,{method:`POST`,body:JSON.stringify(i?{label:r,member:i}:{label:r})});k(`#mint-out`).innerHTML=`<div class="reveal">
        <div class="lbl">New key. This is the only time it is readable.</div>
        <div class="val">${t(a.token)}</div></div>
        <div class="cmd-row"><code>knoot join ${t(a.token)} --relay ${t(n)}</code><button class="copy" type="button">Copy</button></div>`,e(k(`#mint-out`)),await $()}catch(e){i.textContent=e.message,i.hidden=!1}finally{r.disabled=!1}});for(let e of j.querySelectorAll(`[data-attach]`))e.addEventListener(`click`,async()=>{e.disabled=!0;try{await D(`/api/members/attach`,{method:`POST`,body:JSON.stringify({from:e.dataset.attach})}),await $(),Z()}catch(t){let n=k(`#tok-err`);n.textContent=t.message,n.hidden=!1,e.disabled=!1}});for(let e of j.querySelectorAll(`[data-revoke]`))e.addEventListener(`click`,async()=>{if(confirm(`Revoke this key? The machine using it stops coordinating. It fails open, so its agents keep working alone.`)){e.disabled=!0;try{await D(`/api/tokens/${encodeURIComponent(e.dataset.revoke)}/revoke`,{method:`POST`}),await $(),Z()}catch(t){let n=k(`#tok-err`);n.textContent=t.message,n.hidden=!1,e.disabled=!1}}})}function Q(){let e=P?.rooms??[],n=P?.members??[],r=P?.repos??[],i=P?.me,a=i?.role===`owner`||i?.role===`admin`,o=e=>e.repo===`*`&&e.area===`/`?`every repository`:`${e.repo}:${e.area}`;j.innerHTML=`
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Rooms</h1>
          <p>A room decides who can collide with whom. Everyone in a room sees the live claims, the writes and &mdash; when it arrives &mdash; the shared memory of the areas that room holds. Every team starts with one room over everything, which is the right answer until a repository is big enough to be worth splitting.</p>
        </div>
      </div>

      ${a?`<div class="panel">
        <div class="panel-head"><h2>New room</h2></div>
        <div class="panel-body">
          <div class="inline-form">
            <input id="room-name" maxlength="60" placeholder="Room name, such as platform or payments">
            <button class="btn" id="room-go">Create room</button>
          </div>
          <div class="err" id="room-err" hidden></div>
        </div>
      </div>`:``}

      ${e.map(e=>`<div class="panel">
        <div class="panel-head">
          <h2>${t(e.name)}</h2>
          <div class="right">
            <span class="state">${e.members.length} member${e.members.length===1?``:`s`}</span>
            ${a&&e.name!==`general`?`<button class="btn danger sm" data-del-room="${t(e.id)}">Delete</button>`:``}
          </div>
        </div>
        <div class="panel-body">
          <div class="lbl">Areas</div>
          <p class="${e.areas.length?`mono`:`dim`}">${e.areas.length?e.areas.map(n=>`${t(o(n))}${a?` <button class="linkish" data-rm-area="${t(e.id)}" data-repo="${t(n.repo)}" data-area="${t(n.area)}">remove</button>`:``}`).join(` &middot; `):`No areas yet &mdash; nobody in this room coordinates on anything.`}</p>
          ${a?`<div class="inline-form" style="margin-top:12px">
            <select data-area-repo="${t(e.id)}">
              <option value="*">every repository</option>
              ${r.map(e=>`<option value="${t(e.repo)}">${t(e.repo)}</option>`).join(``)}
            </select>
            <input data-area-path="${t(e.id)}" maxlength="120" placeholder="Path prefix, or / for the whole repo" value="/">
            <button class="btn quiet" data-add-area="${t(e.id)}">Add area</button>
          </div>`:``}

          <div class="lbl" style="margin-top:20px">Members</div>
          ${e.members.length?`<table class="rows">
            <tbody>${e.members.map(n=>`<tr>
              <td>${t(n.email)}${n.id===i?.member_id?`<span class="tag mine">you</span>`:``}</td>
              <td class="dim">${t(n.role)}</td>
              <td class="right">${a?`<button class="btn quiet sm" data-rm-member="${t(e.id)}" data-member="${t(n.id)}">Remove</button>`:``}</td>
            </tr>`).join(``)}</tbody></table>`:`<p class="dim">Nobody yet.</p>`}
          ${a?(()=>{let r=n.filter(t=>!t.unassigned&&!e.members.some(e=>e.id===t.id));return r.length?`<div class="inline-form" style="margin-top:12px">
              <select data-member-pick="${t(e.id)}">
                ${r.map(e=>`<option value="${t(e.id)}">${t(e.email)}</option>`).join(``)}
              </select>
              <button class="btn quiet" data-add-member="${t(e.id)}">Add to room</button>
            </div>`:`<p class="dim" style="margin-top:10px">Everyone on the team is in this room.</p>`})():``}
          <div class="err" data-room-err="${t(e.id)}" hidden></div>
        </div>
      </div>`).join(``)}
    </div>`;let s=(e,t)=>{let n=j.querySelector(`[data-room-err="${e}"]`);n&&(n.textContent=t.message,n.hidden=!1)},c=async()=>{await $(),Q()};k(`#room-go`)?.addEventListener(`click`,async()=>{let e=k(`#room-err`);e.hidden=!0;let t=k(`#room-name`).value.trim();if(!t){e.textContent=`A room needs a name.`,e.hidden=!1;return}try{await D(`/api/rooms`,{method:`POST`,body:JSON.stringify({name:t})}),await c()}catch(t){e.textContent=t.message,e.hidden=!1}});for(let e of j.querySelectorAll(`[data-add-area]`))e.addEventListener(`click`,async()=>{let t=e.dataset.addArea,n=j.querySelector(`[data-area-repo="${t}"]`).value,r=j.querySelector(`[data-area-path="${t}"]`).value.trim()||`/`;try{await D(`/api/rooms/${encodeURIComponent(t)}/areas`,{method:`POST`,body:JSON.stringify({repo:n,area:r})}),await c()}catch(e){s(t,e)}});for(let e of j.querySelectorAll(`[data-rm-area]`))e.addEventListener(`click`,async()=>{let t=e.dataset.rmArea;try{await D(`/api/rooms/${encodeURIComponent(t)}/areas`,{method:`POST`,body:JSON.stringify({repo:e.dataset.repo,area:e.dataset.area,remove:!0})}),await c()}catch(e){s(t,e)}});for(let e of j.querySelectorAll(`[data-add-member]`))e.addEventListener(`click`,async()=>{let t=e.dataset.addMember,n=j.querySelector(`[data-member-pick="${t}"]`)?.value;if(!n){s(t,Error(`Everyone in the team is already in this room.`));return}try{await D(`/api/rooms/${encodeURIComponent(t)}/members`,{method:`POST`,body:JSON.stringify({member:n})}),await c()}catch(e){s(t,e)}});for(let e of j.querySelectorAll(`[data-rm-member]`))e.addEventListener(`click`,async()=>{let t=e.dataset.rmMember;try{await D(`/api/rooms/${encodeURIComponent(t)}/members`,{method:`POST`,body:JSON.stringify({member:e.dataset.member,remove:!0})}),await c()}catch(e){s(t,e)}});for(let e of j.querySelectorAll(`[data-del-room]`))e.addEventListener(`click`,async()=>{let t=e.dataset.delRoom;if(confirm(`Delete this room? The people in it keep their keys; they stop sharing the areas this room held.`))try{await D(`/api/rooms/${encodeURIComponent(t)}/delete`,{method:`POST`}),await c()}catch(e){s(t,e)}})}async function Ke(){let n=N===`owner`||N===`admin`,r=P?.members??[];j.innerHTML=`
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Team</h1>
          <p>Everyone here can see the log and hold keys of their own. You are signed in as ${t(N)}.</p>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Members</h2></div>
        <div id="members"><div class="empty">Loading members.</div></div>
      </div>
      
      ${n?`<div class="panel">
        <div class="panel-head"><h2>Add a teammate</h2></div>
        <div class="panel-body">
          <p>This relay has no sign-in behind it, so there is nobody to invite &mdash; you create the person and hand them a key. The key is shown once and cannot be read again; send it over something private.</p>
          <div class="inline-form" style="margin-top:14px">
            <input id="add-email" type="email" placeholder="their@email.com">
            <input id="add-label" type="text" placeholder="their machine" value="first machine">
            <select id="add-role">
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <button class="btn" id="add-go">Add and mint a key</button>
          </div>
          <div id="add-out"></div>
          <div class="err" id="add-err" hidden></div>
        </div>
      </div>`:``}
      
    </div>`,e(j);let i=e=>r.find(t=>t.email.toLowerCase()===e.toLowerCase()),a=async()=>{try{let e=await Oe();k(`#invites`).innerHTML=e.length?`<table class="rows"><thead><tr><th>Email</th><th>Role</th><th>Expires</th><th></th></tr></thead>
           <tbody>${e.map(e=>`<tr>
             <td>${t(e.email)}</td><td class="dim">${t(e.role)}</td>
             <td class="dim">${t(O(Date.parse(e.expires_at)))}</td>
             <td class="right">${n?`<button class="btn quiet sm" data-inv-revoke="${t(e.id)}">Withdraw</button>`:``}</td>
           </tr>`).join(``)}</tbody></table>`:`<div class="empty">None outstanding.</div>`;for(let e of j.querySelectorAll(`[data-inv-revoke]`))e.addEventListener(`click`,async()=>{e.disabled=!0;try{await ke(e.dataset.invRevoke),await a()}catch(t){alert(t.message),e.disabled=!1}})}catch(e){k(`#invites`).innerHTML=`<div class="empty">Could not load invitations: ${t(e.message)}</div>`}},o=async()=>{try{let e=r.filter(e=>!e.unassigned).map(e=>({user_id:``,email:e.email,role:e.role,created_at:``}));k(`#members`).innerHTML=e.length?`<table class="rows"><thead><tr><th>Email</th><th>Role</th><th>Joined</th><th>Keys</th><th></th></tr></thead>
           <tbody>${e.map(e=>{let r=i(e.email),a=(P?.tokens??[]).filter(e=>r&&e.member_id===r.id&&!e.revoked).length;return`<tr><td>${t(e.email)}</td><td class="dim">${t(e.role)}</td>
               <td class="dim">${e.created_at?t(O(Date.parse(e.created_at))):`&mdash;`}</td>
               <td class="dim">${a}</td>
               <td class="right">${n&&e.role!==`owner`?`<button class="btn danger sm" data-remove="${t(e.user_id)}" data-email="${t(e.email)}" data-member="${t(r?.id??``)}">Remove</button>`:``}</td></tr>`}).join(``)}</tbody></table>`:`<div class="empty">Just you so far.</div>`;for(let e of j.querySelectorAll(`[data-remove]`))e.addEventListener(`click`,async()=>{if(confirm(`Remove ${e.dataset.email}? Their keys stop working at once. Nobody else's key changes.`)){e.disabled=!0;try{e.dataset.member&&await D(`/api/members/${encodeURIComponent(e.dataset.member)}/remove`,{method:`POST`}),await $(),await Ke()}catch(t){alert(t.message),e.disabled=!1}}})}catch(e){k(`#members`).innerHTML=`<div class="empty">Could not load members: ${t(e.message)}</div>`}};k(`#add-go`)?.addEventListener(`click`,async()=>{let n=k(`#add-err`);n.hidden=!0;let r=k(`#add-email`).value.trim(),i=k(`#add-label`).value.trim()||`first machine`,a=k(`#add-role`).value;if(!r.includes(`@`)){n.textContent=`That does not look like an email address.`,n.hidden=!1;return}try{let s=await D(`/api/members`,{method:`POST`,body:JSON.stringify({email:r,role:a,label:i})});if(s.existing){n.textContent=`${s.email} is already on this team as ${s.role}. Mint a key for them under Agent keys.`,n.hidden=!1;return}k(`#add-out`).innerHTML=`<div class="reveal">
          <div class="lbl">${t(s.email)}&rsquo;s key. Readable only now.</div>
          <div class="val">${t(s.token??``)}</div>
        </div>
        <div class="cmd-row"><code>knoot join ${t(s.token??``)}</code><button class="copy" type="button">Copy</button></div>`,e(k(`#add-out`)),k(`#add-email`).value=``,await $(),await o()}catch(e){n.textContent=e.message,n.hidden=!1}}),k(`#inv-go`)?.addEventListener(`click`,async()=>{let n=k(`#inv-err`);n.hidden=!0;let r=k(`#inv-email`).value.trim(),i=k(`#inv-role`).value;if(!r.includes(`@`)){n.textContent=`That does not look like an email address.`,n.hidden=!1;return}try{let n=await De(r,i),o=`${location.origin}/app/#join=${n}`;k(`#inv-out`).innerHTML=`<div class="reveal">
          <div class="lbl">Send ${t(r)} this link. It is readable only now.</div>
          <div class="val">${t(o)}</div>
        </div>
        <div class="cmd-row"><code>${t(o)}</code><button class="copy" type="button">Copy</button></div>`,e(k(`#inv-out`)),k(`#inv-email`).value=``,await a()}catch(e){n.textContent=e.message,n.hidden=!1}}),await o()}function qe(){j.innerHTML=`
    <div class="page">
      <div class="page-head"><div><h1>Settings</h1><p>Account and relay details.</p></div></div>
      <div class="panel">
        <div class="panel-head"><h2>Relay</h2></div>
        <div class="panel-body">
          <p>Your agents connect to this address. It is the same host that served this page.</p>
          <div class="cmd-row" style="margin-top:14px"><code>${t(n)}</code><button class="copy" type="button">Copy</button></div>
          <p style="margin-top:16px">Team id <code>${t(P?.team_id??``)}</code></p>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h2>Password</h2></div>
        <div class="panel-body">
          <label class="field" style="max-width:400px;margin-top:0">
            <span>New password</span>
            <input id="new-password" type="password" minlength="8" autocomplete="new-password" placeholder="At least 8 characters">
          </label>
          <button class="btn" id="pw-go" style="margin-top:14px">Change password</button>
          <div class="err" id="pw-err" hidden></div>
          <div class="ok" id="pw-ok" hidden></div>
        </div>
      </div>
    </div>`,e(j),k(`#pw-go`).addEventListener(`click`,async()=>{let e=k(`#pw-err`),t=k(`#pw-ok`);e.hidden=!0,t.hidden=!0;let n=k(`#new-password`).value;if(n.length<8){e.textContent=`Use at least 8 characters.`,e.hidden=!1;return}let{error:r}=await w.auth.updateUser({password:n});if(r){e.textContent=r.message,e.hidden=!1;return}t.textContent=`Password changed.`,t.hidden=!1,k(`#new-password`).value=``})}async function $(){P=await D(`/api/team`)}async function Je(){V()}addEventListener(`hashchange`,()=>{if(A.hidden){R=location.hash===`#signup`?`signup`:`signin`,z();return}W()}),setInterval(async()=>{if(!A.hidden&&M)try{let e=(P?.repos??[]).map(e=>e.repo).join();await $();let t=(P?.repos??[]).map(e=>e.repo).join();(e!==t&&H()!==`sessions`||e!==t&&!I)&&W(),U()}catch{}},2e4),Je();