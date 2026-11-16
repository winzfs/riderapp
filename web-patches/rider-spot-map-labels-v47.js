       function rs47MoreNeighbourhoodNames(){
         if(!state.alive||state.mode!=="simple")return;
         for(const id of ["rs46-district-labels","rs46-neighbourhood-labels"]){
           if(!gl.getLayer(id))continue;
           try{
             if(id==="rs46-district-labels"){
               gl.setLayerZoomRange(id,10.1,24);
               gl.setLayoutProperty(id,"text-padding",3);
               gl.setLayoutProperty(id,"text-allow-overlap",true);
               gl.setLayoutProperty(id,"text-ignore-placement",true);
             }else{
               gl.setLayerZoomRange(id,11,24);
               gl.setLayoutProperty(id,"text-padding",2);
               gl.setLayoutProperty(id,"text-variable-anchor",["top","bottom","left","right"]);
               gl.setLayoutProperty(id,"text-radial-offset",0.45);
             }
           }catch(error){console.warn("RiderSpot label priority",id,error?.message||error)}
         }
         // Publicly documented representative places (not administrative centroids).
         // Low-zoom overview only; vector map labels take over when zoomed in.
         const sourceId="rs47-gwangsan-overview",labelId="rs47-gwangsan-overview-labels";
         if(!gl.getSource(sourceId)){
           const places=[
             ["운남동",126.8218941,35.1730207,1],
             ["월곡동",126.8096579,35.1712284,2],
             ["수완지구",126.8102029,35.193844,3],
             ["신창동",126.8408242,35.1956109,4]
           ];
           gl.addSource(sourceId,{type:"geojson",data:{
             type:"FeatureCollection",features:places.map(([name,lon,lat,rank])=>({
               type:"Feature",properties:{name,rank},geometry:{type:"Point",coordinates:[lon,lat]}
             }))
           }});
         }
         if(!gl.getLayer(labelId)){
           gl.addLayer({
             id:labelId,type:"symbol",source:sourceId,minzoom:10.7,maxzoom:13.8,
             layout:{
               "text-field":["get","name"],"text-font":["Noto Sans Regular"],
               "text-size":["interpolate",["linear"],["zoom"],10.7,10.5,12.5,12,13.8,12.5],
               "text-anchor":"center","text-padding":3,
               "text-allow-overlap":true,"text-ignore-placement":true,
               "text-variable-anchor":["top","bottom","left","right"],
               "text-radial-offset":0.4,
               "symbol-sort-key":["get","rank"]
             },
             paint:{"text-color":"#35685f","text-halo-color":"#fbfffd",
                    "text-halo-width":2,"text-halo-blur":0.1}
           });
         }
         window.__rsGwangsanOverviewLabelsReady=true;
       }

