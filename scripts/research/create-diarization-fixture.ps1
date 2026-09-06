param([string]$OutputDirectory)
$ErrorActionPreference='Stop'
if(-not $OutputDirectory){$OutputDirectory=Join-Path (Get-Location) ('.avid-mcp-analysis/diarization-fixture-'+[guid]::NewGuid().ToString())}
if(Test-Path -LiteralPath $OutputDirectory){throw 'Fixture destination already exists'}
New-Item -ItemType Directory -Path $OutputDirectory | Out-Null
$OutputDirectory=(Resolve-Path -LiteralPath $OutputDirectory).Path
Add-Type -AssemblyName System.Speech
$format=New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000,[System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,[System.Speech.AudioFormat.AudioChannel]::Mono)
$turns=@(
 @{voice='Microsoft David Desktop';text='I have reviewed the vineyard arrival footage. Please keep the wide shot before the close up.'},
 @{voice='Microsoft Zira Desktop';text='The sound mix is ready for review. I will lower the background music during the interview.'},
 @{voice='Microsoft David Desktop';text='The barrel room scene belongs after the outdoor walk. We should remove the shaky camera section.'},
 @{voice='Microsoft Zira Desktop';text='The final delivery should include captions. I will check the export again tomorrow morning.'}
)
$records=@()
for($index=0;$index -lt $turns.Count;$index++){
 $speaker=New-Object System.Speech.Synthesis.SpeechSynthesizer
 try{
  $speaker.SelectVoice($turns[$index].voice)
  $file=Join-Path $OutputDirectory ("turn-$index.wav")
  $speaker.SetOutputToWaveFile($file,$format)
  $speaker.Speak($turns[$index].text)
  $records+=@{index=$index;voice=$turns[$index].voice;text=$turns[$index].text;file=$file}
 }finally{$speaker.Dispose()}
}
@{sampleRate=16000;turns=$records;scope='Original synthetic editorial utterances; voice labels identify the selected synthesizer, not a real person.'} | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $OutputDirectory 'fixture.json')
Write-Output (Join-Path $OutputDirectory 'fixture.json')
