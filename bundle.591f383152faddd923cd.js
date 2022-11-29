(()=>{"use strict";var t,e={627:(t,e,o)=>{var n=o(477),r=o(365),a=o(217),i=o(304),s=o(659),l=o(378),d=o(760),c=o(788),u=o(946);const m=o.p+"05da9eb34317fb94ef87d4b528004fc7.glb";let h,p,v,f,g,w,b,x,y,C;n.Kj0.prototype.raycast=l.uL,n.u9r.prototype.computeBoundsTree=l.Xy,n.u9r.prototype.disposeBoundsTree=l.sn;let k=new n.FM8;const M=new Float32Array(1),P={options:{strategy:d.ms,maxLeafTris:10,maxDepth:40,rebuild:function(){z()}},visualization:{displayMesh:!0,simpleColors:!1,outline:!0,traversalThreshold:50},benchmark:{displayRays:!1,firstHitOnly:!0,rotations:10,castCount:1e3}};class T extends n.jyz{constructor(t){super({uniforms:{map:{value:null},threshold:{value:35},boundsColor:{value:new n.Ilk(16777215)},backgroundColor:{value:new n.Ilk(0)},thresholdColor:{value:new n.Ilk(16711680)},resolution:{value:new n.FM8},outlineAlpha:{value:.5}},vertexShader:"\n\t\t\t\tvarying vec2 vUv;\n\t\t\t\tvoid main() {\n\t\t\t\t\tvUv = uv;\n\t\t\t\t\tgl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );\n\t\t\t\t}\n\t\t\t",fragmentShader:"\n\t\t\t\tuniform sampler2D map;\n\t\t\t\tuniform float threshold;\n\t\t\t\tuniform vec3 thresholdColor;\n\t\t\t\tuniform vec3 boundsColor;\n\t\t\t\tuniform vec3 backgroundColor;\n\t\t\t\tuniform vec2 resolution;\n\t\t\t\tuniform float outlineAlpha;\n\t\t\t\tvarying vec2 vUv;\n\t\t\t\tvoid main() {\n\t\t\t\t\tfloat count = texture2D( map, vUv ).r;\n\t\t\t\t\tif ( count == 0.0 ) {\n\t\t\t\t\t\tvec2 offset = 1.0 / resolution;\n\t\t\t\t\t\tfloat c1 = texture2D( map, vUv + offset * vec2( 1.0, 0.0 ) ).r;\n\t\t\t\t\t\tfloat c2 = texture2D( map, vUv + offset * vec2( - 1.0, 0.0 ) ).r;\n\t\t\t\t\t\tfloat c3 = texture2D( map, vUv + offset * vec2( 0.0, 1.0 ) ).r;\n\t\t\t\t\t\tfloat c4 = texture2D( map, vUv + offset * vec2( 0.0, - 1.0 ) ).r;\n\t\t\t\t\t\tfloat maxC = max( c1, max( c2, max( c3, c4 ) ) );\n\t\t\t\t\t\tif ( maxC != 0.0 ) {\n\t\t\t\t\t\t\tgl_FragColor.rgb = mix( backgroundColor, mix( boundsColor, vec3( 1.0 ), 0.5 ), outlineAlpha );\n\t\t\t\t\t\t\tgl_FragColor.a = 1.0;\n\t\t\t\t\t\t\treturn;\n\t\t\t\t\t\t}\n\t\t\t\t\t}\n\t\t\t\t\tif ( count > threshold ) {\n\t\t\t\t\t\tgl_FragColor.rgb = thresholdColor.rgb;\n\t\t\t\t\t\tgl_FragColor.a = 1.0;\n\t\t\t\t\t} else {\n\t\t\t\t\t\tfloat alpha = count / threshold;\n\t\t\t\t\t\tvec3 color = mix( boundsColor, vec3( 1.0 ), pow( alpha, 1.75 ) );\n\t\t\t\t\t\tgl_FragColor.rgb = mix( backgroundColor, color, alpha ).rgb ;\n\t\t\t\t\t\tgl_FragColor.a = 1.0;\n\t\t\t\t\t}\n\t\t\t\t}\n\t\t\t"});const e=this.uniforms;for(const t in e)Object.defineProperty(this,t,{get(){return this.uniforms[t].value},set(e){this.uniforms[t].value=e}});this.setValues(t)}}function F(){p.aspect=window.innerWidth/window.innerHeight,p.updateProjectionMatrix(),v.setSize(window.innerWidth,window.innerHeight),v.setPixelRatio(window.devicePixelRatio),y.setSize(window.innerWidth*window.devicePixelRatio,window.innerHeight*window.devicePixelRatio)}function z(){const t=performance.now();g.geometry.computeBoundsTree({strategy:parseInt(P.options.strategy),maxLeafTris:P.options.maxLeafTris,maxDepth:P.options.maxDepth});const e=performance.now()-t;f.update(),E();const o=(0,u.em)(g.geometry.boundsTree)[0];w.innerText=`construction time        : ${e.toFixed(2)}ms\nsurface area score       : ${o.surfaceAreaScore.toFixed(2)}\ntotal nodes              : ${o.nodeCount}\ntotal leaf nodes         : ${o.leafNodeCount}\nmin / max tris per leaf  : ${o.tris.min} / ${o.tris.max}\nmin / max depth          : ${o.depth.min} / ${o.depth.max}\nmemory (incl. geometry)  : ${(1e-6*(0,u.Hq)(g.geometry.boundsTree)).toFixed(3)} mb \nmemory (excl. geometry)  : ${(1e-6*(0,u.Hq)(g.geometry.boundsTree._roots)).toFixed(3)} mb`}function O(t=!1){let e=null,o=null;t&&(g.updateMatrixWorld(),o=new n.u9r,x.geometry.dispose(),e=[]);const r=new n.iMs;r.firstHitOnly=P.benchmark.firstHitOnly;const a=P.benchmark.castCount,i=P.benchmark.rotations,{ray:s}=r,{origin:l,direction:d}=s,c=performance.now();for(let o=0;o<a;o++){const c=o/a-.5;if(l.set(Math.cos(.75*Math.PI*c)*Math.sin(2*i*Math.PI*o/a),2*c,Math.cos(.75*Math.PI*c)*Math.cos(2*i*Math.PI*o/a)).multiplyScalar(2.5),d.set(Math.cos(5*i*c),Math.sin(10*i*c),Math.sin(5*i*c)).sub(l).normalize(),r.intersectObject(g),t){const t=r.intersectObject(g)[0];if(e.push(l.clone()),t)e.push(t.point.clone());else{const t=new n.Pa4;s.at(5,t),e.push(t)}}}const u=performance.now()-c;return t&&(o.setFromPoints(e),x.geometry=o),u}let R=0,j=0;function E(){R=0,j=0}!function(){w=document.getElementById("output"),b=document.getElementById("benchmark"),v=new n.CP7({antialias:!0}),v.setPixelRatio(window.devicePixelRatio),v.setSize(window.innerWidth,window.innerHeight),v.setClearColor(0,1),document.body.appendChild(v.domElement),y=new n.dd2(1,1,{format:n.hEm,type:n.VzW}),C=new i.T(new T({map:y.texture,depthWrite:!1})),h=new n.xsS,p=new n.cPb(75,window.innerWidth/window.innerHeight,.1,50),p.position.set(-2.5,1.5,2.5),p.far=100,p.updateProjectionMatrix(),new r.z(p,v.domElement),window.addEventListener("resize",F,!1),F(),(new a.E).load(m,(t=>{t.scene.traverse((t=>{t.isMesh&&"Dragon"===t.name&&(g=t)})),g.material=new n.vBJ({colorWrite:!1}),g.geometry.center(),g.position.set(0,0,0),h.add(g),f=new c.y(g,40),f.displayEdges=!1,f.displayParents=!0,f.color.set(16777215),f.opacity=1,f.depth=40;const e=f.meshMaterial;e.blending=n.Xaj,e.blendDst=n.ghN,h.add(f),z(),O(!0)})),x=new n.ejS,x.material.opacity=.1,x.material.transparent=!0,x.material.depthWrite=!1,x.frustumCulled=!1,h.add(x);const t=new s.XS,e=t.addFolder("BVH");e.add(P.options,"strategy",{CENTER:d.dv,AVERAGE:d.$V,SAH:d.ms}),e.add(P.options,"maxLeafTris",1,30,1),e.add(P.options,"maxDepth",1,40,1),e.add(P.options,"rebuild"),e.open();const o=t.addFolder("Visualization");o.add(P.visualization,"displayMesh"),o.add(P.visualization,"simpleColors"),o.add(P.visualization,"outline"),o.add(P.visualization,"traversalThreshold",1,300,1),o.open();const l=t.addFolder("Benchmark");l.add(P.benchmark,"displayRays"),l.add(P.benchmark,"firstHitOnly").onChange(E),l.add(P.benchmark,"castCount",100,5e3,1).onChange((()=>{E(),O(!0)})),l.add(P.benchmark,"rotations",1,20,1).onChange((()=>{E(),O(!0)})),l.open(),window.addEventListener("pointermove",(t=>{k.set(t.clientX,window.innerHeight-t.clientY)}))}(),function t(){requestAnimationFrame(t);const e=v.getPixelRatio();v.readRenderTargetPixels(y,k.x*e,k.y*e,1,1,M),g&&(R=Math.min(R+1,50),j+=(O()-j)/R,b.innerText=`\ntraversal depth at mouse : ${Math.round(M[0])}\nbenchmark rolling avg    : ${j.toFixed(3)} ms`),P.visualization.simpleColors?(C.material.boundsColor.set(16777215),C.material.thresholdColor.set(16711680),C.material.backgroundColor.set(0)):(C.material.boundsColor.set(16763432),C.material.thresholdColor.set(15277667),C.material.backgroundColor.set(8231)),C.material.threshold=P.visualization.traversalThreshold,C.material.outlineAlpha=P.visualization.outline?.5:0,C.material.resolution.set(y.width,y.height),x.visible=!1,v.autoClear=!0,g&&(g.visible=P.visualization.displayMesh),v.setRenderTarget(y),v.render(h,p),v.setRenderTarget(null),C.render(v),v.autoClear=!1,x.visible=P.benchmark.displayRays,g&&v.render(g,p),v.render(x,p)}()}},o={};function n(t){var r=o[t];if(void 0!==r)return r.exports;var a=o[t]={exports:{}};return e[t](a,a.exports,n),a.exports}n.m=e,t=[],n.O=(e,o,r,a)=>{if(!o){var i=1/0;for(c=0;c<t.length;c++){for(var[o,r,a]=t[c],s=!0,l=0;l<o.length;l++)(!1&a||i>=a)&&Object.keys(n.O).every((t=>n.O[t](o[l])))?o.splice(l--,1):(s=!1,a<i&&(i=a));if(s){t.splice(c--,1);var d=r();void 0!==d&&(e=d)}}return e}a=a||0;for(var c=t.length;c>0&&t[c-1][2]>a;c--)t[c]=t[c-1];t[c]=[o,r,a]},n.d=(t,e)=>{for(var o in e)n.o(e,o)&&!n.o(t,o)&&Object.defineProperty(t,o,{enumerable:!0,get:e[o]})},n.o=(t,e)=>Object.prototype.hasOwnProperty.call(t,e),n.p="/hyperstep/",(()=>{var t={178:0};n.O.j=e=>0===t[e];var e=(e,o)=>{var r,a,[i,s,l]=o,d=0;if(i.some((e=>0!==t[e]))){for(r in s)n.o(s,r)&&(n.m[r]=s[r]);if(l)var c=l(n)}for(e&&e(o);d<i.length;d++)a=i[d],n.o(t,a)&&t[a]&&t[a][0](),t[a]=0;return n.O(c)},o=self.webpackChunk=self.webpackChunk||[];o.forEach(e.bind(null,0)),o.push=e.bind(null,o.push.bind(o))})();var r=n.O(void 0,[365,659,449],(()=>n(627)));r=n.O(r)})();
//# sourceMappingURL=bundle.591f383152faddd923cd.js.map