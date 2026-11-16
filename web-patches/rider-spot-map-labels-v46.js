       function rs46LocalLabels(){
         if(!state.alive||state.mode!=="simple")return;
         const style=gl.getStyle();
         if(!style?.sources?.openmaptiles)return;
         const nameField=["coalesce",["get","name:ko"],["get","name:nonlatin"],["get","name"],["get","name:latin"]];
         const tiers=[
           {id:"rs46-district-labels",source:"place",classes:["suburb","borough","town"],minzoom:10.7,color:"#405d57",size:[11,11.5,13,13,16,14],pad:8},
           {id:"rs46-neighbourhood-labels",source:"place",classes:["quarter","neighbourhood","village","hamlet"],minzoom:11.6,color:"#556e67",size:[11,10.3,13,11.7,16,13],pad:5},
           {id:"rs46-major-road-labels",source:"transportation_name",classes:["trunk","primary","secondary","tertiary"],minzoom:12.6,color:"#77837e",size:[12,9.3,14,10.7,16,12],pad:6,road:true}
         ];
         let added=0;
         for(const tier of tiers){
           if(gl.getLayer(tier.id))continue;
           const layer={
             id:tier.id,type:"symbol",source:"openmaptiles","source-layer":tier.source,
             minzoom:tier.minzoom,filter:["match",["get","class"],tier.classes,true,false],
             layout:{
               "text-field":nameField,"text-font":["Noto Sans Regular"],
               "text-size":["interpolate",["linear"],["zoom"],...tier.size],
               "text-max-width":10,"text-padding":tier.pad,"text-optional":true,
               "text-allow-overlap":false,
               "symbol-sort-key":["coalesce",["get","rank"],30]
             },
             paint:{"text-color":tier.color,"text-halo-color":"#f8fbfa","text-halo-width":1.65,"text-halo-blur":0.15}
           };
           if(tier.road){
             layer.layout["symbol-placement"]="line";
             layer.layout["symbol-spacing"]=400;
             layer.layout["text-max-angle"]=40;
             delete layer.layout["symbol-sort-key"];
           }
           try{gl.addLayer(layer);added++;}
           catch(error){console.warn("RiderSpot lower-zoom label layer",tier.id,error?.message||error);}
         }
         if(added)window.__rsLocalLabelsReady=true;
       }

