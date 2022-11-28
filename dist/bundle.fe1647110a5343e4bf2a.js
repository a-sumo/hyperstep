(()=>{"use strict";var t,e={235:(t,e,o)=>{var n=o(477),r=o(365),a=o(217),i=o(304),s=o(659),l=o(378),d=o(760),u=o(788),c=o(946);let m,h,p,v,f,g,w,b,x,y;n.Kj0.prototype.raycast=l.uL,n.u9r.prototype.computeBoundsTree=l.Xy,n.u9r.prototype.disposeBoundsTree=l.sn;let C=new n.FM8;const k=new Float32Array(1),M={options:{strategy:d.ms,maxLeafTris:10,maxDepth:40,rebuild:function(){F()}},visualization:{displayMesh:!0,simpleColors:!1,outline:!0,traversalThreshold:50},benchmark:{displayRays:!1,firstHitOnly:!0,rotations:10,castCount:1e3}};class P extends n.jyz{constructor(t){super({uniforms:{map:{value:null},threshold:{value:35},boundsColor:{value:new n.Ilk(16777215)},backgroundColor:{value:new n.Ilk(0)},thresholdColor:{value:new n.Ilk(16711680)},resolution:{value:new n.FM8},outlineAlpha:{value:.5}},vertexShader:"\n\t\t\t\tvarying vec2 vUv;\n\t\t\t\tvoid main() {\n\t\t\t\t\tvUv = uv;\n\t\t\t\t\tgl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );\n\t\t\t\t}\n\t\t\t",fragmentShader:"\n\t\t\t\tuniform sampler2D map;\n\t\t\t\tuniform float threshold;\n\t\t\t\tuniform vec3 thresholdColor;\n\t\t\t\tuniform vec3 boundsColor;\n\t\t\t\tuniform vec3 backgroundColor;\n\t\t\t\tuniform vec2 resolution;\n\t\t\t\tuniform float outlineAlpha;\n\t\t\t\tvarying vec2 vUv;\n\t\t\t\tvoid main() {\n\t\t\t\t\tfloat count = texture2D( map, vUv ).r;\n\t\t\t\t\tif ( count == 0.0 ) {\n\t\t\t\t\t\tvec2 offset = 1.0 / resolution;\n\t\t\t\t\t\tfloat c1 = texture2D( map, vUv + offset * vec2( 1.0, 0.0 ) ).r;\n\t\t\t\t\t\tfloat c2 = texture2D( map, vUv + offset * vec2( - 1.0, 0.0 ) ).r;\n\t\t\t\t\t\tfloat c3 = texture2D( map, vUv + offset * vec2( 0.0, 1.0 ) ).r;\n\t\t\t\t\t\tfloat c4 = texture2D( map, vUv + offset * vec2( 0.0, - 1.0 ) ).r;\n\t\t\t\t\t\tfloat maxC = max( c1, max( c2, max( c3, c4 ) ) );\n\t\t\t\t\t\tif ( maxC != 0.0 ) {\n\t\t\t\t\t\t\tgl_FragColor.rgb = mix( backgroundColor, mix( boundsColor, vec3( 1.0 ), 0.5 ), outlineAlpha );\n\t\t\t\t\t\t\tgl_FragColor.a = 1.0;\n\t\t\t\t\t\t\treturn;\n\t\t\t\t\t\t}\n\t\t\t\t\t}\n\t\t\t\t\tif ( count > threshold ) {\n\t\t\t\t\t\tgl_FragColor.rgb = thresholdColor.rgb;\n\t\t\t\t\t\tgl_FragColor.a = 1.0;\n\t\t\t\t\t} else {\n\t\t\t\t\t\tfloat alpha = count / threshold;\n\t\t\t\t\t\tvec3 color = mix( boundsColor, vec3( 1.0 ), pow( alpha, 1.75 ) );\n\t\t\t\t\t\tgl_FragColor.rgb = mix( backgroundColor, color, alpha ).rgb ;\n\t\t\t\t\t\tgl_FragColor.a = 1.0;\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t"});const e=this.uniforms;for(const t in e)Object.defineProperty(this,t,{get(){return this.uniforms[t].value},set(e){this.uniforms[t].value=e}});this.setValues(t)}}function T(){h.aspect=window.innerWidth/window.innerHeight,h.updateProjectionMatrix(),p.setSize(window.innerWidth,window.innerHeight),p.setPixelRatio(window.devicePixelRatio),x.setSize(window.innerWidth*window.devicePixelRatio,window.innerHeight*window.devicePixelRatio)}function F(){const t=performance.now();f.geometry.computeBoundsTree({strategy:parseInt(M.options.strategy),maxLeafTris:M.options.maxLeafTris,maxDepth:M.options.maxDepth});const e=performance.now()-t;v.update(),j();const o=(0,c.em)(f.geometry.boundsTree)[0];g.innerText=`construction time        : ${e.toFixed(2)}ms\nsurface area score       : ${o.surfaceAreaScore.toFixed(2)}\ntotal nodes              : ${o.nodeCount}\ntotal leaf nodes         : ${o.leafNodeCount}\nmin / max tris per leaf  : ${o.tris.min} / ${o.tris.max}\nmin / max depth          : ${o.depth.min} / ${o.depth.max}\nmemory (incl. geometry)  : ${(1e-6*(0,c.Hq)(f.geometry.boundsTree)).toFixed(3)} mb \nmemory (excl. geometry)  : ${(1e-6*(0,c.Hq)(f.geometry.boundsTree._roots)).toFixed(3)} mb`}function z(t=!1){let e=null,o=null;t&&(f.updateMatrixWorld(),o=new n.u9r,b.geometry.dispose(),e=[]);const r=new n.iMs;r.firstHitOnly=M.benchmark.firstHitOnly;const a=M.benchmark.castCount,i=M.benchmark.rotations,{ray:s}=r,{origin:l,direction:d}=s,u=performance.now();for(let o=0;o<a;o++){const u=o/a-.5;if(l.set(Math.cos(.75*Math.PI*u)*Math.sin(2*i*Math.PI*o/a),2*u,Math.cos(.75*Math.PI*u)*Math.cos(2*i*Math.PI*o/a)).multiplyScalar(2.5),d.set(Math.cos(5*i*u),Math.sin(10*i*u),Math.sin(5*i*u)).sub(l).normalize(),r.intersectObject(f),t){const t=r.intersectObject(f)[0];if(e.push(l.clone()),t)e.push(t.point.clone());else{const t=new n.Pa4;s.at(5,t),e.push(t)}}}const c=performance.now()-u;return t&&(o.setFromPoints(e),b.geometry=o),c}let O=0,R=0;function j(){O=0,R=0}!function(){g=document.getElementById("output"),w=document.getElementById("benchmark"),p=new n.CP7({antialias:!0}),p.setPixelRatio(window.devicePixelRatio),p.setSize(window.innerWidth,window.innerHeight),p.setClearColor(0,1),document.body.appendChild(p.domElement),x=new n.dd2(1,1,{format:n.hEm,type:n.VzW}),y=new i.T(new P({map:x.texture,depthWrite:!1})),m=new n.xsS,h=new n.cPb(75,window.innerWidth/window.innerHeight,.1,50),h.position.set(-2.5,1.5,2.5),h.far=100,h.updateProjectionMatrix(),new r.z(h,p.domElement),window.addEventListener("resize",T,!1),T(),(new a.E).load("../assets/models/DragonAttenuation.glb",(t=>{t.scene.traverse((t=>{t.isMesh&&"Dragon"===t.name&&(f=t)})),f.material=new n.vBJ({colorWrite:!1}),f.geometry.center(),f.position.set(0,0,0),m.add(f),v=new u.y(f,40),v.displayEdges=!1,v.displayParents=!0,v.color.set(16777215),v.opacity=1,v.depth=40;const e=v.meshMaterial;e.blending=n.Xaj,e.blendDst=n.ghN,m.add(v),F(),z(!0)})),b=new n.ejS,b.material.opacity=.1,b.material.transparent=!0,b.material.depthWrite=!1,b.frustumCulled=!1,m.add(b);const t=new s.XS,e=t.addFolder("BVH");e.add(M.options,"strategy",{CENTER:d.dv,AVERAGE:d.$V,SAH:d.ms}),e.add(M.options,"maxLeafTris",1,30,1),e.add(M.options,"maxDepth",1,40,1),e.add(M.options,"rebuild"),e.open();const o=t.addFolder("Visualization");o.add(M.visualization,"displayMesh"),o.add(M.visualization,"simpleColors"),o.add(M.visualization,"outline"),o.add(M.visualization,"traversalThreshold",1,300,1),o.open();const l=t.addFolder("Benchmark");l.add(M.benchmark,"displayRays"),l.add(M.benchmark,"firstHitOnly").onChange(j),l.add(M.benchmark,"castCount",100,5e3,1).onChange((()=>{j(),z(!0)})),l.add(M.benchmark,"rotations",1,20,1).onChange((()=>{j(),z(!0)})),l.open(),window.addEventListener("pointermove",(t=>{C.set(t.clientX,window.innerHeight-t.clientY)}))}(),function t(){requestAnimationFrame(t);const e=p.getPixelRatio();p.readRenderTargetPixels(x,C.x*e,C.y*e,1,1,k),f&&(O=Math.min(O+1,50),R+=(z()-R)/O,w.innerText=`\ntraversal depth at mouse : ${Math.round(k[0])}\nbenchmark rolling avg    : ${R.toFixed(3)} ms`),M.visualization.simpleColors?(y.material.boundsColor.set(16777215),y.material.thresholdColor.set(16711680),y.material.backgroundColor.set(0)):(y.material.boundsColor.set(16763432),y.material.thresholdColor.set(15277667),y.material.backgroundColor.set(8231)),y.material.threshold=M.visualization.traversalThreshold,y.material.outlineAlpha=M.visualization.outline?.5:0,y.material.resolution.set(x.width,x.height),b.visible=!1,p.autoClear=!0,f&&(f.visible=M.visualization.displayMesh),p.setRenderTarget(x),p.render(m,h),p.setRenderTarget(null),y.render(p),p.autoClear=!1,b.visible=M.benchmark.displayRays,f&&p.render(f,h),p.render(b,h)}()}},o={};function n(t){var r=o[t];if(void 0!==r)return r.exports;var a=o[t]={exports:{}};return e[t](a,a.exports,n),a.exports}n.m=e,t=[],n.O=(e,o,r,a)=>{if(!o){var i=1/0;for(u=0;u<t.length;u++){for(var[o,r,a]=t[u],s=!0,l=0;l<o.length;l++)(!1&a||i>=a)&&Object.keys(n.O).every((t=>n.O[t](o[l])))?o.splice(l--,1):(s=!1,a<i&&(i=a));if(s){t.splice(u--,1);var d=r();void 0!==d&&(e=d)}}return e}a=a||0;for(var u=t.length;u>0&&t[u-1][2]>a;u--)t[u]=t[u-1];t[u]=[o,r,a]},n.d=(t,e)=>{for(var o in e)n.o(e,o)&&!n.o(t,o)&&Object.defineProperty(t,o,{enumerable:!0,get:e[o]})},n.o=(t,e)=>Object.prototype.hasOwnProperty.call(t,e),(()=>{var t={178:0};n.O.j=e=>0===t[e];var e=(e,o)=>{var r,a,[i,s,l]=o,d=0;if(i.some((e=>0!==t[e]))){for(r in s)n.o(s,r)&&(n.m[r]=s[r]);if(l)var u=l(n)}for(e&&e(o);d<i.length;d++)a=i[d],n.o(t,a)&&t[a]&&t[a][0](),t[a]=0;return n.O(u)},o=self.webpackChunk=self.webpackChunk||[];o.forEach(e.bind(null,0)),o.push=e.bind(null,o.push.bind(o))})();var r=n.O(void 0,[365,659,449],(()=>n(235)));r=n.O(r)})();
//# sourceMappingURL=bundle.fe1647110a5343e4bf2a.js.map