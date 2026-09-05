#!/usr/bin/env node
import { parseArgs } from "node:util";
import { loadConfig } from "./config.js";
import { clientConfiguration, installConfiguration, doctor, resolveSetupEntry, type SetupClient } from "./setup.js";
import {configurationStatus,changeConfiguration,type ConfigurationOperation} from "./setup-lifecycle.js";

const { values } = parseArgs({ options: {
  "server-entry":{type:"string"},"server-entry-sha256":{type:"string"},
  doctor:{type:"boolean"}, client:{type:"string"}, root:{type:"string",multiple:true},
  output:{type:"string"}, native:{type:"string"}, config:{type:"string"}, install:{type:"boolean"},
  "download-models":{type:"boolean"}, "model-dir":{type:"string"},
  speech:{type:"boolean"},"speech-model":{type:"string"},
  captions:{type:"boolean"},faces:{type:"boolean"}, summaries:{type:"boolean"},
  "config-status":{type:"boolean"},update:{type:"boolean"},remove:{type:"boolean"},restore:{type:"string"},"expected-sha256":{type:"string"},
  "package-install":{type:"string"},"package-root":{type:"string"},"package-sha256":{type:"string"},
  "package-status":{type:"string"},"package-remove":{type:"string"},"package-recover":{type:"string"},
} });
try {
  if(!!values["server-entry"]!==!!values["server-entry-sha256"]||values["server-entry"]&&!values.client)throw new Error("Server entry overrides require --client, --server-entry and --server-entry-sha256");
  const serverEntry=values["server-entry"]?await resolveSetupEntry(values["server-entry"],values["server-entry-sha256"]!):undefined;
  if(values["package-root"]&&!values["package-install"]&&!values["package-status"]&&!values["package-remove"]&&!values["package-recover"])throw new Error("Package root requires a package operation");
  if(values["package-sha256"]&&!values["package-install"])throw new Error("Package archive checksum requires --package-install");
  if(values["speech-model"]&&(!values.speech||!values["download-models"]))throw new Error("--speech-model requires --download-models --speech");
  if([values.doctor,values["download-models"],values["config-status"],values.install,values.update,values.remove,values.restore,values["package-install"],values["package-status"],values["package-remove"],values["package-recover"]].filter(Boolean).length>1)throw new Error("Choose one setup operation at a time");
  if(values["package-status"]||values["package-remove"]||values["package-recover"]){
    if(!values["package-root"])throw new Error("Package status/removal requires --package-root");
    const {packageStatus,removePackage,recoverPackageRemoval}=await import("./package-lifecycle.js");
    if(values["package-recover"]){
      if(!values["expected-sha256"])throw new Error("Package recovery requires --expected-sha256 receipt hash");
      console.log(JSON.stringify(await recoverPackageRemoval(values["package-root"],values["package-recover"],values["expected-sha256"]),null,2));
    }else if(values["package-remove"]){
      if(!values["expected-sha256"])throw new Error("Package removal requires --expected-sha256 from package status receiptSha256");
      console.log(JSON.stringify(await removePackage(values["package-root"],values["package-remove"],values["expected-sha256"]),null,2));
    }else console.log(JSON.stringify(await packageStatus(values["package-root"],values["package-status"]!),null,2));
  }else if(values["package-install"]){
    if(!values["package-root"]||!values["package-sha256"])throw new Error("--package-install requires --package-root and --package-sha256");
    const {installPackage}=await import("./package-install.js");
    console.log(JSON.stringify(await installPackage(values["package-install"],values["package-root"],values["package-sha256"]),null,2));
  }else if(values["config-status"]){
    if(!values.config)throw new Error("--config-status requires --config FILE");
    console.log(JSON.stringify(await configurationStatus(values.config),null,2));
  }else if(values.update||values.remove||values.restore){
    if(!values.config||!values["expected-sha256"])throw new Error("Configuration changes require --config FILE and --expected-sha256 from --config-status");
    if(!values.client||!["claude","cursor","vscode","lmstudio","generic"].includes(values.client))throw new Error("Specify the client whose Avid entry should change");
    const key=values.client==="vscode"?"servers":"mcpServers",expectedSha256=values["expected-sha256"];
    const operation:ConfigurationOperation=values.restore?{action:"restore" as const,key,expectedSha256,backup:values.restore}:values.remove?{action:"remove" as const,key,expectedSha256}:{action:"update" as const,key,expectedSha256,entry:(clientConfiguration(values.client as SetupClient,values.root??[],values.output,values.native,serverEntry) as Record<string,any>)[key]["avid-media-composer"]};
    console.log(JSON.stringify(await changeConfiguration(values.config,operation),null,2));
  }else
  if (values["download-models"]) {
    if([values.faces,values.speech,values.summaries,values.captions].filter(Boolean).length>1)throw new Error("Choose one model family per download command");
    if(!values["model-dir"])throw new Error("--download-models requires --model-dir PATH");
    if(values.captions){
      const {loadCaptionModel,CAPTION_MODEL,CAPTION_REVISION}=await import("./library/captions.js");const loaded=await loadCaptionModel(values["model-dir"],true);await loaded.model.dispose();console.log(JSON.stringify({downloaded:CAPTION_MODEL,revision:CAPTION_REVISION}));
    }else if(values.summaries){
      const {loadSummaryModel,SUMMARY_MODEL,SUMMARY_REVISION}=await import("./library/summaries.js");
      const model=await loadSummaryModel(values["model-dir"],true);await model.dispose();console.log(JSON.stringify({downloaded:SUMMARY_MODEL,revision:SUMMARY_REVISION}));
    }else if(values.faces){
      const {faceRuntime}=await import("./library/face-runtime.js");
      console.log(JSON.stringify(await faceRuntime(values["model-dir"],loadConfig().pythonExecutable,true)));
    }else if(values.speech){
      const {loadSpeechModel}=await import("./library/speech.js");
      const {speechModel,speechModels}=await import("./library/speech-options.js");
      const selection=speechModel.parse(values["speech-model"]??"tiny.en"),selected=speechModels[selection];
      const model=await loadSpeechModel(values["model-dir"],true,selection); await model.dispose();
      console.log(JSON.stringify({downloaded:selected.model,revision:selected.revision}));
    }else{
    const {loadVisualModels,VISUAL_MODEL,VISUAL_REVISION}=await import("./library/visual.js");
    const models=await loadVisualModels(values["model-dir"],true);
    await models.text.dispose(); await models.vision.dispose();
    console.log(JSON.stringify({downloaded:VISUAL_MODEL,revision:VISUAL_REVISION,directory:values["model-dir"]}));
    }
  } else if (values.doctor) console.log(JSON.stringify(await doctor(loadConfig()),null,2));
  else if (values.client) {
    if (!["claude","cursor","vscode","lmstudio","generic"].includes(values.client)) throw new Error("Client must be claude, cursor, vscode, lmstudio or generic");
    const config = clientConfiguration(values.client as SetupClient,values.root ?? [],values.output,values.native,serverEntry);
    if (values.install) {
      if (!values.config) throw new Error("--install requires an explicit --config file");
      console.log(JSON.stringify(await installConfiguration(values.config,config),null,2));
    } else console.log(JSON.stringify(config,null,2));
  } else console.log("avid-mcp --package-install ABSOLUTE_ARCHIVE.tgz --package-root ABSOLUTE_DIRECTORY --package-sha256 HASH\navid-mcp --package-status INSTALLATION_UUID --package-root ABSOLUTE_DIRECTORY\navid-mcp --package-remove INSTALLATION_UUID --package-root ABSOLUTE_DIRECTORY --expected-sha256 RECEIPT_HASH\navid-mcp --package-recover UUID.removing-UUID --package-root ABSOLUTE_DIRECTORY --expected-sha256 RECEIPT_HASH\navid-mcp --doctor\navid-mcp --client claude|cursor|vscode|lmstudio|generic --root ABSOLUTE_PATH [--output PATH] [--native AVID_EXE] [--config FILE --install] [--server-entry FILE --server-entry-sha256 HASH]\navid-mcp --download-models --model-dir PATH [--speech [--speech-model tiny.en|tiny] | --faces | --summaries | --captions]\navid-mcp --config-status --config FILE\navid-mcp --client CLIENT --config FILE --expected-sha256 HASH --update --root PATH\navid-mcp --client CLIENT --config FILE --expected-sha256 HASH --remove\navid-mcp --client CLIENT --config FILE --expected-sha256 HASH --restore BACKUP\nWithout a mutation flag, setup only prints configuration. Codex: use codex mcp add with the generated command and environment.");
} catch(error) { console.error((error as Error).message); process.exitCode=1; }
