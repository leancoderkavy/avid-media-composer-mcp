#!/usr/bin/env node
import { parseArgs } from "node:util";
import { loadConfig } from "./config.js";
import { clientConfiguration, installConfiguration, doctor, type SetupClient } from "./setup.js";
import {configurationStatus,changeConfiguration,type ConfigurationOperation} from "./setup-lifecycle.js";

const { values } = parseArgs({ options: {
  doctor:{type:"boolean"}, client:{type:"string"}, root:{type:"string",multiple:true},
  output:{type:"string"}, native:{type:"string"}, config:{type:"string"}, install:{type:"boolean"},
  "download-models":{type:"boolean"}, "model-dir":{type:"string"},
  speech:{type:"boolean"},
  faces:{type:"boolean"},
  "config-status":{type:"boolean"},update:{type:"boolean"},remove:{type:"boolean"},restore:{type:"string"},"expected-sha256":{type:"string"},
} });
try {
  if([values.doctor,values["download-models"],values["config-status"],values.install,values.update,values.remove,values.restore].filter(Boolean).length>1)throw new Error("Choose one setup operation at a time");
  if(values["config-status"]){
    if(!values.config)throw new Error("--config-status requires --config FILE");
    console.log(JSON.stringify(await configurationStatus(values.config),null,2));
  }else if(values.update||values.remove||values.restore){
    if(!values.config||!values["expected-sha256"])throw new Error("Configuration changes require --config FILE and --expected-sha256 from --config-status");
    if(!values.client||!["claude","cursor","vscode","lmstudio","generic"].includes(values.client))throw new Error("Specify the client whose Avid entry should change");
    const key=values.client==="vscode"?"servers":"mcpServers",expectedSha256=values["expected-sha256"];
    const operation:ConfigurationOperation=values.restore?{action:"restore" as const,key,expectedSha256,backup:values.restore}:values.remove?{action:"remove" as const,key,expectedSha256}:{action:"update" as const,key,expectedSha256,entry:(clientConfiguration(values.client as SetupClient,values.root??[],values.output,values.native) as Record<string,any>)[key]["avid-media-composer"]};
    console.log(JSON.stringify(await changeConfiguration(values.config,operation),null,2));
  }else
  if (values["download-models"]) {
    if(values.faces&&values.speech)throw new Error("Choose either --faces or --speech per download command");
    if(!values["model-dir"])throw new Error("--download-models requires --model-dir PATH");
    if(values.faces){
      const {faceRuntime}=await import("./library/face-runtime.js");
      console.log(JSON.stringify(await faceRuntime(values["model-dir"],loadConfig().pythonExecutable,true)));
    }else if(values.speech){
      const {loadSpeechModel,SPEECH_MODEL,SPEECH_REVISION}=await import("./library/speech.js");
      const model=await loadSpeechModel(values["model-dir"],true); await model.dispose();
      console.log(JSON.stringify({downloaded:SPEECH_MODEL,revision:SPEECH_REVISION}));
    }else{
    const {loadVisualModels,VISUAL_MODEL,VISUAL_REVISION}=await import("./library/visual.js");
    const models=await loadVisualModels(values["model-dir"],true);
    await models.text.dispose(); await models.vision.dispose();
    console.log(JSON.stringify({downloaded:VISUAL_MODEL,revision:VISUAL_REVISION,directory:values["model-dir"]}));
    }
  } else if (values.doctor) console.log(JSON.stringify(await doctor(loadConfig()),null,2));
  else if (values.client) {
    if (!["claude","cursor","vscode","lmstudio","generic"].includes(values.client)) throw new Error("Client must be claude, cursor, vscode, lmstudio or generic");
    const config = clientConfiguration(values.client as SetupClient,values.root ?? [],values.output,values.native);
    if (values.install) {
      if (!values.config) throw new Error("--install requires an explicit --config file");
      console.log(JSON.stringify(await installConfiguration(values.config,config),null,2));
    } else console.log(JSON.stringify(config,null,2));
  } else console.log("avid-mcp --doctor\navid-mcp --client claude|cursor|vscode|lmstudio|generic --root ABSOLUTE_PATH [--output PATH] [--native AVID_EXE] [--config FILE --install]\navid-mcp --download-models --model-dir PATH [--speech | --faces]\navid-mcp --config-status --config FILE\navid-mcp --client CLIENT --config FILE --expected-sha256 HASH --update --root PATH\navid-mcp --client CLIENT --config FILE --expected-sha256 HASH --remove\navid-mcp --client CLIENT --config FILE --expected-sha256 HASH --restore BACKUP\nWithout a mutation flag, setup only prints configuration. Codex: use codex mcp add with the generated command and environment.");
} catch(error) { console.error((error as Error).message); process.exitCode=1; }
