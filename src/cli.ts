#!/usr/bin/env node
import { parseArgs } from "node:util";
import { loadConfig } from "./config.js";
import { clientConfiguration, installConfiguration, doctor, type SetupClient } from "./setup.js";

const { values } = parseArgs({ options: {
  doctor:{type:"boolean"}, client:{type:"string"}, root:{type:"string",multiple:true},
  output:{type:"string"}, native:{type:"string"}, config:{type:"string"}, install:{type:"boolean"},
  "download-models":{type:"boolean"}, "model-dir":{type:"string"},
  speech:{type:"boolean"},
} });
try {
  if (values["download-models"]) {
    if(!values["model-dir"])throw new Error("--download-models requires --model-dir PATH");
    if(values.speech){
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
  } else console.log("avid-mcp --doctor\navid-mcp --client claude|cursor|vscode|lmstudio|generic --root ABSOLUTE_PATH [--output PATH] [--native AVID_EXE] [--config FILE --install]\nWithout --install, setup only prints configuration. Codex: use codex mcp add with the generated command and environment.");
} catch(error) { console.error((error as Error).message); process.exitCode=1; }
