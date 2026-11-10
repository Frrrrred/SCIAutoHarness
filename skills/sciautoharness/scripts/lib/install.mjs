import fs from 'node:fs/promises';

import childProcess from 'node:child_process';

import path from 'node:path';

import { fileURLToPath } from 'node:url';

import { randomUUID } from 'node:crypto';

import { gzipSync } from 'node:zlib';

import {canonicalName,assertRecord,assertStructure,envelope,canonicalJson,parseJsonBytes} from './identity.mjs';

const inventory=assertRecord(parseJsonBytes(await fs.readFile(new URL('./source-inventory.json',import.meta.url))),'source-inventory');

import {hostProfile} from './hosts.mjs';

import { contained, digest, exists, hash, inside, json, listFiles, lockedRoots, writeJson } from './files.mjs';

export const skillSource = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');

const start = '<!-- sciautoharness:start -->';

const end = '<!-- sciautoharness:end -->';

export function defaultRule(skillPath,host='codex') {
  const profile=hostProfile(host);
  const rule=`${start}\n## Complex task harness\n\nHonor explicit project-read boundaries during intake and execution. Resolve project-relative paths against the supplied task directory; do not inspect the host cwd to locate an already supplied project. Without a supplied in-scope Git baseline, do not probe ancestor/sibling metadata or run Git discovery, status or history (including git -C); review current files and mark historical evidence unverified.\n\nClassify the complete request first. Cross-module behavior with dependent tests, comprehensive multi-module reviews, multi-stage deliverables and substantive research require Harness; theoretical research includes dependent definitions, proofs, counterexamples and a manuscript. For a complex task, before any project intake, main and delegated agents must separately await reading ${path.join(skillPath,'SKILL.md').replaceAll('\\','/')} and receive its contents. Do not batch this read with SCOPE, README, enumeration or any project operation. Simple questions, isolated diagnosis and single low-risk edits proceed directly; a domain skill does not replace the Harness review gate.\n\nNew task/no associated Harness: read necessary in-scope inputs and follow the skill authoring route to prepare the complete package yourself. Missing formal approval does not block authorized planning. Include the master, substantive major stages, applicable protocols, recovery, deliverables, dependencies, acceptance and unknowns. With file authorization, resolve links per document and actually run the documented package path check. A read-only request without file authorization uses the complete in-session route: verify referenced local inputs read-only, keep a full ID/revision/text and approval provenance in chat, and do not invent a disk package, machine digest or CLI context. Authorized implementation includes necessary task-local Harness files. Present the complete current version and await direct final-human approval before formal work, including proofs, results or manuscripts in chat/files/handoffs. Do not self-approve or treat silence, the initial request or another task's approval as approval. For delegated unapproved new work or material changes, prepare and return the complete pending-review package normally with all navigation links. For an independent read-only subtask within the same valid approval, inherit its ID/revision, approval provenance, current phase, scope, permissions and acceptance; for file-backed work read master/recovery then derive context; for session-only work inherit the complete approved text and accepted dependency summaries without seeking a disk package or invoking disk lifecycle, and return actual evidence without a new approval identity. The parent cannot grant new permissions by forwarding approval. Do not ask the parent to supply/write/approve a package or replace final delivery with a status message.\n\nExisting layered task with supplied entry: first project reads ONLY its master and recovery; the skill runtime interface may be read, then immediately derive context. Defer SCOPE, README and task descriptions until after context even when named in the prompt. Before context, do not enumerate/broad-search, load full state or old receipts/reports; search matches count as loading. Only an unknown or actually missing entry permits narrow filename lookup within the explicit task directory. Use context's approval provenance/dependency summaries; read raw linked evidence only for a stated specific gap. Absent current approval means complete review. After context, load only master constraints, current phase and applicable protocols/accepted dependency summaries. Use native begin, actual inline submit and verify; runtime owns formal state/receipts, so do not create payload JSON. Preserve active run identity even when evidence becomes stale or approval becomes invalid. Never re-review or restart to clear active/pending work. After the original run actually ends, submit its real step/runId and evidence; stale-run factual closure does not restore approval or accept results. Check context active-execution and latest-acceptance summaries for recovery; submit does not stop or cancel a process. Follow the approved dependencies and acceptance; execution records, file existence and exit zero do not establish correctness.\n\nPreserve source/evidence integrity, negative/inconclusive findings, current user permissions and domain constraints. Reassess applicable skills when the current work changes, without bulk-loading or re-reading unchanged skills. Material changes to methods, scope, inputs, permissions, resources or acceptance require renewed review and invalidate affected downstream evidence. Use absolute file-link targets in the normal final handoff, including manual review packages; preserve Windows drive paths such as E:/ literally. Use only format=sciautoharness, schemaVersion=1 and the entry-specific kind for current records. Unsupported records remain unchanged and are refused before control writes; no approval or verified state is inherited. Whole corrupt/unknown state requires manual recovery; only trustworthy current state and a complete begin permit original identity diagnostics and stale factual closure after contract damage. Keep already active tasks on the controller that began them under their existing authorization; do not hot-switch an active run to an updated runtime. Use native Codex tools. Native tool use follows this Harness route and the user's actual permissions; no additional services or execution permissions are implied.\n\nWhen evidence shows an infeasible plan, repeated failure to advance critical acceptance, or persistent blockage without a viable path, load references/replanning.md after context. Audit the whole objective and actual lessons, preserve original goals, hard constraints and execution facts, and prepare a complete replacement when needed. Preserve the original controller and settle active or pending work through supported operations; material changes require direct final-user review. Normal waiting or one timeout does not automatically require rewriting.\n\nFor collaboration, ownership transfer, execution/verification/rework handoffs or multiple chats, load references/context-hygiene.md in the installed Harness skill as the authoritative protocol. Default: primary is the sole business writer and Harness controller; native delegates are independently read-only. Separate user chats and creation, communication, business-write and state-write rights require explicit user authorization. Confirm old writing activity actually stopped before transfer or verify; a verifier does not fix files or invoke verify. Preserve original run/host/executor; changed closed pending/verified/stale artifacts require rework before repair, failed executions retain direct retry, and changed review versions need fresh evidence. Ordinary small tasks and handoffs remain lightweight.\n${end}\n`;
  return host==='codex'?rule:rule.replace('Use native Codex tools.',`Use native ${profile.label} tools actually supplied by this host.`).replace('\n'+end,'\n\nFor new work, use the reviewed host policy and the '+host+' profile. Preserve the original host/mode/executor when closing active work. No host selection grants extra permissions.\n'+end);
}

async function futureRoot(root) {
  let current=path.resolve(root); const suffix=[];
  while (!(await exists(current))) { suffix.unshift(path.basename(current)); current=path.dirname(current); }
  return path.join(await fs.realpath(current),...suffix);
}

const directoryIdentity=s=>({dev:String(s.dev),ino:String(s.ino),mode:String(s.mode)});

const sameDirectory=(a,b)=>!!a&&!!b&&['dev','ino','mode'].every(k=>a[k]===b[k]);

async function inspectDirectory(dir){
 if(!await exists(dir))return null;
 const st=await fs.lstat(dir,{bigint:true});
 if(!st.isDirectory()||st.isSymbolicLink()||st.ino===0n||await fs.realpath(dir)!==dir)throw new Error('Unsafe linked directory or installation root: '+dir);
 return directoryIdentity(st);
}

async function assertDirectory(dir,expected){const actual=await inspectDirectory(dir);if(expected===null?actual!==null:!sameDirectory(actual,expected))throw new Error('Installation directory identity changed: '+dir);}

const identity=s=>({dev:String(s.dev),ino:String(s.ino),nlink:String(s.nlink),mode:String(s.mode)});

const sameIdentity=(a,b)=>!!a&&!!b&&['dev','ino','nlink','mode'].every(k=>a[k]===b[k]);

async function inspect(file){
 if(!await exists(file))return {sha256:null,identity:null};
 const s=await fs.lstat(file,{bigint:true});
 if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1n||s.ino===0n)throw new Error(`Installation target must be a regular single-link file with reliable identity: ${file}`);
 return {sha256:await digest(file),identity:identity(s)};
}

function decode(bytes){
 let text;try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{throw new Error('Unsupported AGENTS encoding: require lossless UTF-8 (optional BOM).');}
 if(text.includes('\0')||!Buffer.from(text,'utf8').equals(bytes))throw new Error('Unsupported AGENTS encoding: require lossless UTF-8.');
 return text;
}

async function assertTarget(file,expectedIdentity,expectedHash){
 const actual=await inspect(file);
 if(!sameIdentity(actual.identity,expectedIdentity)||actual.sha256!==expectedHash)throw new Error(`Installation target identity/content changed: ${file}; review a fresh preview.`);
}

async function writeTarget(change,bytes,expectedIdentity,expectedHash){
 let handle,failed=false,operationError;
 try{
  handle=await fs.open(change.target,expectedIdentity?'r+':'wx',expectedIdentity?undefined:(change.sourceMode??0o666));
  const opened=await handle.stat({bigint:true});
  if(!opened.isFile()||opened.nlink!==1n||opened.ino===0n||(expectedIdentity&&!sameIdentity(identity(opened),expectedIdentity)))throw new Error(`Opened target identity/link state changed: ${change.target}`);
  await assertTarget(change.target,identity(opened),expectedIdentity?expectedHash:hash(Buffer.alloc(0)));
  await handle.writeFile(bytes);await handle.truncate(bytes.length);
  const after=await handle.stat({bigint:true});
  if(!sameIdentity(identity(after),identity(opened)))throw new Error(`Target identity changed during write: ${change.target}`);
 }catch(e){failed=true;operationError=e;}
 if(handle)try{await handle.close();}catch(cleanupError){if(failed)throw Object.assign(new Error(`${operationError?.message??String(operationError)}; target handle cleanup also failed: ${cleanupError.message}`,{cause:operationError}),{operationError,cleanupError});throw cleanupError;}
 if(failed)throw operationError;
 return (await inspect(change.target)).identity;
}

async function assertExpectedTarget(file,id,sha){if(id===null&&sha===null){if(await exists(file))throw new Error('New installation target appeared: '+file);return;}return assertTarget(file,id,sha);}

function managedReplacement(oldBytes,rule,reviewedRule){
 const old=decode(oldBytes),markers=[...old.matchAll(/<!-- sciautoharness:(start|end) -->/g)];
 if([...old.matchAll(/<!--\s*([a-z0-9-]*harness)\s*:/g)].some(m=>m[1]!==canonicalName))throw new Error('Unsupported harness managed marker; preserve the original instructions.');
 if([...old.matchAll(/<!--\s*sciautoharness\s*:/g)].length!==markers.length)throw new Error('Malformed managed rule markers.');
 if(!markers.length&&reviewedRule)throw new Error('Explicit reviewed before block is absent.');
 if(!markers.length)return Buffer.concat([oldBytes,Buffer.from(`${old&&!old.endsWith('\n')?'\n':''}${old?'\n':''}${rule}`)]);
 if(markers.length!==2||markers[0][1]!=='start'||markers[1][1]!=='end')throw new Error('Malformed or duplicate managed rule markers.');
 const i=markers[0].index,j=markers[1].index+markers[1][0].length,actual=old.slice(i,j);
 if(reviewedRule&&actual!==reviewedRule.before)throw new Error('Explicit reviewed before differs from the actual current block.');
 if(actual===rule.trimEnd())return oldBytes;
 if(!reviewedRule)throw new Error('Existing custom managed block requires an exact reviewed before/after.');
 return Buffer.from(old.slice(0,i)+rule.trimEnd()+old.slice(j),'utf8');
}


const equalMapping=(a,b)=>JSON.stringify(Object.keys(a).sort())===JSON.stringify(Object.keys(b).sort())&&Object.keys(a).every(k=>a[k]===b[k]);

const privateFileMetadataScript=String.raw`
function Assert-PrivateFileAcl($descriptor,[string]$owner){
 $flags=$descriptor.ControlFlags
 if(!($flags -band [Security.AccessControl.ControlFlags]::DiscretionaryAclPresent) -or
    ($flags -band ([Security.AccessControl.ControlFlags]::DiscretionaryAclProtected -bor
                   [Security.AccessControl.ControlFlags]::DiscretionaryAclAutoInheritRequired)) -or
    $null -eq $descriptor.DiscretionaryAcl){throw 'Unexpected private file DACL'}
 $expected=[Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
 [void]$expected.Add($owner)
 [void]$expected.Add('S-1-5-18')
 if($descriptor.DiscretionaryAcl.Count -ne $expected.Count){throw 'Unexpected private file ACE count'}
 foreach($ace in $descriptor.DiscretionaryAcl){
  if($ace -isnot [Security.AccessControl.CommonAce] -or
     $ace.AceType -ne [Security.AccessControl.AceType]::AccessAllowed -or
     [int]$ace.AceFlags -ne 16 -or $ace.AccessMask -ne 0x1f01ff -or
     !$expected.Remove($ace.SecurityIdentifier.Value)){throw 'Unexpected private file ACE'}
 }
}

function Set-PrivateFileOwner($fileEntry,$parentEntry,$binding,$before,[string]$defaultOwner){
 Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class SciHarnessPrivateFile {
 [StructLayout(LayoutKind.Sequential)]
 struct Info {
  public uint Attributes;
  public System.Runtime.InteropServices.ComTypes.FILETIME Creation, Access, Write;
  public uint Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
 }
 [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
 static extern SafeFileHandle CreateFileW(string path, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);
 [DllImport("kernel32.dll", SetLastError=true)]
 static extern bool GetFileInformationByHandle(SafeFileHandle handle, out Info facts);

 public static SafeFileHandle Open(string path, bool directory) {
  const uint ReadControl = 0x20000, WriteOwner = 0x80000, GenericRead = 0x80000000;
  const uint OpenExisting = 3, ShareReadWrite = 3, OpenReparsePoint = 0x200000, BackupSemantics = 0x2000000;
  var access = directory ? ReadControl : GenericRead | WriteOwner;
  var flags = directory ? OpenReparsePoint | BackupSemantics : OpenReparsePoint;
  var handle = CreateFileW(path, access, ShareReadWrite, IntPtr.Zero, OpenExisting, flags, IntPtr.Zero);
  if (!handle.IsInvalid) return handle;
  var error = Marshal.GetLastWin32Error();
  handle.Dispose();
  throw new Win32Exception(error);
 }

 public static uint Confirm(SafeFileHandle handle, string expectedId, bool directory) {
  Info facts;
  if (!GetFileInformationByHandle(handle, out facts)) throw new Win32Exception(Marshal.GetLastWin32Error());
  var id = (((ulong)facts.IndexHigh << 32) | facts.IndexLow).ToString(System.Globalization.CultureInfo.InvariantCulture);
  if (id != expectedId || (facts.Attributes & 0x400) != 0 || ((facts.Attributes & 0x10) != 0) != directory ||
      (!directory && (facts.Links != 1 || facts.SizeHigh != 0 || facts.SizeLow != 0)))
   throw new InvalidOperationException("Private file or parent identity changed");
  return facts.Volume;
 }
}
'@
 $owner=[string]$binding.parentSecurity.ownerSid
 $parent=$null
 $file=$null
 $stream=$null
 try {
  $parent=[SciHarnessPrivateFile]::Open((Native-Path ([string]$parentEntry.path)),$true)
  $parentVolume=[SciHarnessPrivateFile]::Confirm($parent,[string]$binding.parentId,$true)
  $file=[SciHarnessPrivateFile]::Open((Native-Path ([string]$fileEntry.path)),$false)
  $fileVolume=[SciHarnessPrivateFile]::Confirm($file,[string]$binding.fileId,$false)
  if($fileVolume -ne $parentVolume){throw 'Private file volume changed'}
  $parentNow=Read-Metadata $parentEntry
  if(!(Same-Security $parentNow $binding.parentSecurity) -or $parentNow.attributes -cne $binding.parentSecurity.attributes){
   throw 'Private storage security changed before file owner correction'
  }
  $stream=[IO.FileStream]::new($file,[IO.FileAccess]::Read)
  $acl=[IO.FileSystemAclExtensions]::GetAccessControl($stream)
  $original=[Security.AccessControl.RawSecurityDescriptor]::new($acl.GetSecurityDescriptorBinaryForm(),0)
  Assert-PrivateFileAcl $original $owner
  if($original.Owner.Value -cne $defaultOwner -or $original.Owner.Value -cne $before.ownerSid -or $original.Group.Value -cne $before.groupSid){
   throw 'Private file owner or group changed before correction'
  }
  $access=[Security.AccessControl.AccessControlSections]::Access
  $ownerOnly=[Security.AccessControl.FileSecurity]::new()
  $ownerOnly.SetOwner([Security.Principal.SecurityIdentifier]::new($owner))
  [IO.FileSystemAclExtensions]::SetAccessControl($stream,$ownerOnly)
  $acl=[IO.FileSystemAclExtensions]::GetAccessControl($stream)
  $after=[Security.AccessControl.RawSecurityDescriptor]::new($acl.GetSecurityDescriptorBinaryForm(),0)
  Assert-PrivateFileAcl $after $owner
  if($after.Owner.Value -cne $owner -or $after.Group.Value -cne $original.Group.Value -or
     $after.GetSddlForm($access) -cne $original.GetSddlForm($access)){throw 'Private file security changed during owner correction'}
  $verified=Read-Metadata $fileEntry $owner
  if($verified.ownerSid -cne $owner -or $verified.groupSid -cne $before.groupSid -or
     $verified.attributes -cne $before.attributes){throw 'Private file metadata changed during owner correction'}
  $parentAfter=Read-Metadata $parentEntry
  if(!(Same-Security $parentAfter $binding.parentSecurity) -or $parentAfter.attributes -cne $binding.parentSecurity.attributes){
   throw 'Private storage security changed during file owner correction'
  }
  if([SciHarnessPrivateFile]::Confirm($file,[string]$binding.fileId,$false) -ne $fileVolume -or
     [SciHarnessPrivateFile]::Confirm($parent,[string]$binding.parentId,$true) -ne $parentVolume){throw 'Private file volume changed during owner correction'}
  return @{file=$verified;parent=$parentAfter}
 } finally {
  if($stream){$stream.Dispose()}elseif($file){$file.Dispose()}
  if($parent){$parent.Dispose()}
 }
}

function Read-PrivateFileMetadata($request,$binding){
 $files=@($request.entries | Where-Object {$_.objectKind -ceq 'file'})
 $parents=@($request.entries | Where-Object {$_.objectKind -ceq 'directory'})
 if($request.action -cne 'capture' -or @($request.entries).Count -ne 2 -or
    $files.Count -ne 1 -or $parents.Count -ne 1 -or
    @($binding.PSObject.Properties.Name).Count -ne 3 -or
    $binding.fileId -isnot [string] -or $binding.fileId -cnotmatch '^[1-9][0-9]*$' -or
    $binding.parentId -isnot [string] -or $binding.parentId -cnotmatch '^[1-9][0-9]*$' -or
    [IO.Path]::GetDirectoryName([string]$files[0].path) -cne [string]$parents[0].path){
  throw 'Invalid private file capture binding'
 }
 $fileEntry=$files[0]
 $parentEntry=$parents[0]
 $expected=$binding.parentSecurity
 $parent=Read-Metadata $parentEntry
 if(!$expected.ownerSid -or !(Same-Security $parent $expected) -or $parent.attributes -cne $expected.attributes){
  throw 'Private storage security changed before file write'
 }
 $file=Read-Metadata $fileEntry ([string]$expected.ownerSid)
 if($file.ownerSid -cne $expected.ownerSid){
  # Windows can assign the token's default owner rather than its user to a new file.
  # Only that expected mismatch can be corrected, while the file is still empty.
  $token=[Security.Principal.WindowsIdentity]::GetCurrent()
  try{
   $defaultOwner=$token.Owner.Value
   if($token.User.Value -cne $expected.ownerSid -or $defaultOwner -cne $file.ownerSid){
    throw 'Unexpected owner of private file'
   }
   $corrected=Set-PrivateFileOwner $fileEntry $parentEntry $binding $file $defaultOwner
   $file=$corrected.file
   $parent=$corrected.parent
  }finally{$token.Dispose()}
 }
 return @{$fileEntry.id=$file;$parentEntry.id=$parent}
}
`;

const metadataScript=String.raw`
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$utf8=[Text.UTF8Encoding]::new($false)
[Console]::InputEncoding=$utf8
[Console]::OutputEncoding=$utf8
$OutputEncoding=$utf8
$sections=[Security.AccessControl.AccessControlSections]::Owner -bor [Security.AccessControl.AccessControlSections]::Group -bor [Security.AccessControl.AccessControlSections]::Access
function Native-Path([string]$p){if($p.StartsWith('\\?\')){return $p};if($p.StartsWith('\\')){return '\\?\UNC\'+$p.Substring(2)};return '\\?\'+$p}
function Read-Metadata($entry,[string]$privateOwner){
 $p=[string]$entry.path
 $native=Native-Path $p
 $item=Get-Item -LiteralPath $native -Force -ErrorAction Stop
 if($item.PSProvider.Name -cne 'FileSystem' -or (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)){throw 'Unsafe metadata object'}
 $kind=if($item.PSIsContainer){'directory'}else{'file'}
 if($kind -cne [string]$entry.objectKind){throw 'Metadata type changed'}
 $acl=Get-Acl -LiteralPath $native -ErrorAction Stop
 if($privateOwner){
  $descriptor=[Security.AccessControl.RawSecurityDescriptor]::new($acl.GetSecurityDescriptorBinaryForm(),0)
  Assert-PrivateFileAcl $descriptor $privateOwner
 }
 $streams=@(Get-Item -LiteralPath $native -Stream '*' -Force -ErrorAction Stop)
 [string[]]$names=@($streams | Where-Object {$_.Stream -cne ':$DATA'} | ForEach-Object {[string]$_.Stream})
 if($privateOwner -and $names.Count -ne 0){throw 'Unexpected private file alternate streams'}
 [Array]::Sort($names,[StringComparer]::Ordinal)
 $ads=[Collections.Generic.List[object]]::new()
 foreach($name in $names){
  if(!$name -or $name.IndexOfAny([char[]]":\/") -ge 0){throw 'Unexpected alternate stream name'}
  $stream=$null;$sha=$null
  try{
   $stream=[IO.File]::Open($native+':'+$name,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
   $sha=[Security.Cryptography.SHA256]::Create()
   $sum=([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-','').ToLowerInvariant()
   $ads.Add([ordered]@{name=$name;length=[string]$stream.Length;sha256=$sum})
  }finally{if($sha){$sha.Dispose()};if($stream){$stream.Dispose()}}
 }
 return [ordered]@{id=[string]$entry.id;path=$p;objectKind=$kind;ownerSid=$acl.GetOwner([Security.Principal.SecurityIdentifier]).Value;groupSid=$acl.GetGroup([Security.Principal.SecurityIdentifier]).Value;sddl=$acl.GetSecurityDescriptorSddlForm($sections);attributes=[string][int64]$item.Attributes;namedStreams=$ads.ToArray()}
}
function Same-Security($a,$b){
 foreach($key in @('ownerSid','groupSid','sddl')){if(![string]::Equals([string]$a[$key],[string]$b.$key,[StringComparison]::Ordinal)){return $false}}
 $left=@($a.namedStreams);$right=@($b.namedStreams)
 if($left.Count -ne $right.Count){return $false}
 for($i=0;$i -lt $left.Count;$i++){foreach($key in @('name','length','sha256')){if(![string]::Equals([string]$left[$i][$key],[string]$right[$i].$key,[StringComparison]::Ordinal)){return $false}}}
 return $true
}

function New-PrivateStorage($entry){
 Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class SciHarnessPrivateStorage {
 [StructLayout(LayoutKind.Sequential)] struct SA {public int length;public IntPtr descriptor;[MarshalAs(UnmanagedType.Bool)]public bool inherit;}
 [StructLayout(LayoutKind.Sequential)] struct INFO {public uint attributes;public System.Runtime.InteropServices.ComTypes.FILETIME creation,access,write;public uint volume,sizeHigh,sizeLow,links,indexHigh,indexLow;}
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateDirectoryW(string path,ref SA security);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern SafeFileHandle CreateFileW(string path,uint access,uint share,IntPtr security,uint disposition,uint flags,IntPtr template);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle handle,out INFO facts);
 public static SafeFileHandle Create(string path,byte[] descriptor){
  IntPtr memory=Marshal.AllocHGlobal(descriptor.Length);
  try{Marshal.Copy(descriptor,0,memory,descriptor.Length);var security=new SA{length=Marshal.SizeOf(typeof(SA)),descriptor=memory,inherit=false};if(!CreateDirectoryW(path,ref security))throw new Win32Exception(Marshal.GetLastWin32Error());}finally{Marshal.FreeHGlobal(memory);}
  var handle=CreateFileW(path,0,3,IntPtr.Zero,3,0x02200000,IntPtr.Zero);if(handle.IsInvalid){var error=Marshal.GetLastWin32Error();handle.Dispose();throw new Win32Exception(error);}return handle;
 }
 public static string Id(SafeFileHandle handle){INFO facts;if(!GetFileInformationByHandle(handle,out facts))throw new Win32Exception(Marshal.GetLastWin32Error());if((facts.attributes&0x10)==0||(facts.attributes&0x400)!=0)throw new InvalidOperationException("Unsafe created directory");return (((ulong)facts.indexHigh<<32)|facts.indexLow).ToString(System.Globalization.CultureInfo.InvariantCulture);}
}
'@
 $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
 $text='O:'+ $sid +'D:P(A;OICI;FA;;;SY)';if($sid -cne 'S-1-5-18'){$text+='(A;OICI;FA;;;'+$sid+')'}
 $descriptor=[Security.AccessControl.RawSecurityDescriptor]::new($text);$bytes=[byte[]]::new($descriptor.BinaryLength);$descriptor.GetBinaryForm($bytes,0)
 $handle=$null
 try{
  $handle=[SciHarnessPrivateStorage]::Create((Native-Path ([string]$entry.path)),$bytes)
  $objectId=[SciHarnessPrivateStorage]::Id($handle);$observed=Read-Metadata $entry
  $actual=[Security.AccessControl.RawSecurityDescriptor]::new([string]$observed.sddl)
  $wanted=[Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal);[void]$wanted.Add($sid);[void]$wanted.Add('S-1-5-18')
  if($observed.ownerSid -cne $sid -or ($actual.ControlFlags -band [Security.AccessControl.ControlFlags]::DiscretionaryAclProtected) -eq 0 -or $actual.DiscretionaryAcl.Count -ne $wanted.Count -or @($observed.namedStreams).Count -ne 0){throw 'Private directory security mismatch'}
  foreach($ace in $actual.DiscretionaryAcl){if($ace.AceType -ne [Security.AccessControl.AceType]::AccessAllowed -or $ace.AccessMask -ne 2032127 -or [int]$ace.AceFlags -ne 3 -or !$wanted.Remove($ace.SecurityIdentifier.Value)){throw 'Unexpected private directory ACE'}}
  if($wanted.Count -ne 0 -or [SciHarnessPrivateStorage]::Id($handle) -cne $objectId){throw 'Private directory identity changed'}
  return @{observed=$observed;objectId=$objectId}
 }finally{if($handle){$handle.Dispose()}}
}

$completed=[Collections.Generic.List[string]]::new();$result=[Collections.Generic.List[object]]::new();$failedPath=$null;$stage='input';$code=0
try{
 $request=[Console]::In.ReadToEnd() | ConvertFrom-Json -Depth 30
 if($request.format -cne 'sciautoharness' -or $request.kind -cne 'metadata-request' -or $request.schemaVersion -ne 1 -or $request.action -cnotin @('capture','restoreArchive','createPrivateStorage')){throw 'Unsupported metadata request'}
 $entries=@($request.entries);$observed=[Collections.Generic.List[object]]::new();$stage='preflight'
 if($request.action -ceq 'createPrivateStorage'){$stage='createPrivateStorage';if($entries.Count -ne 1 -or $entries[0].objectKind -cne 'directory'){throw 'Invalid private creation request'};$failedPath=[string]$entries[0].path;$created=New-PrivateStorage $entries[0];$createdObjectId=$created.objectId;$observed.Add($created.observed)}
 elseif($null -ne $request.extensions.privateFile){
  $failedPath=[string]($entries | Where-Object {$_.objectKind -ceq 'file'} | Select-Object -First 1).path
  $privateMetadata=Read-PrivateFileMetadata $request $request.extensions.privateFile
  foreach($entry in $entries){$observed.Add($privateMetadata[[string]$entry.id])}
 }else{foreach($entry in $entries){$failedPath=[string]$entry.path;$observed.Add((Read-Metadata $entry))}}
 if($request.action -ceq 'restoreArchive'){
  $archive=[int64][IO.FileAttributes]::Archive
  for($i=0;$i -lt $entries.Count;$i++){
   $entry=$entries[$i];$now=$observed[$i];$failedPath=[string]$entry.path
   if($entry.objectKind -cne 'file' -or !(Same-Security $now $entry.expected)){throw 'Original security or stream drift'}
   if((([int64]$now.attributes -bxor [int64]$entry.expected.attributes) -band (-bnot $archive)) -ne 0){throw 'Unexpected original attribute drift'}
  }
  $stage='restoreArchive'
  for($i=0;$i -lt $entries.Count;$i++){
   $entry=$entries[$i];$failedPath=[string]$entry.path
   if([int64]$observed[$i].attributes -ne [int64]$entry.expected.attributes){[IO.File]::SetAttributes((Native-Path $failedPath),[IO.FileAttributes][int64]$entry.expected.attributes)}
   $completed.Add([string]$entry.id)
  }
  $stage='verify'
  foreach($entry in $entries){$failedPath=[string]$entry.path;$now=Read-Metadata $entry;if(!(Same-Security $now $entry.expected) -or $now.attributes -cne [string]$entry.expected.attributes){throw 'Original metadata restoration mismatch'};$result.Add($now)}
 }else{foreach($item in $observed){$result.Add($item);$completed.Add([string]$item.id)}}
 $payloads=@($result.ToArray() | ForEach-Object {[ordered]@{id=$_.id;path=$_.path;objectKind=$_.objectKind;metadata=[ordered]@{format='sciautoharness';schemaVersion=1;kind='installation-metadata';platform='win32';coverage='owner-group-dacl-attributes-ads';ownerSid=$_.ownerSid;groupSid=$_.groupSid;sddl=$_.sddl;attributes=$_.attributes;namedStreams=$_.namedStreams;limitations=@('SACL','extendedAttributes')}}});$response=[ordered]@{format='sciautoharness';schemaVersion=1;kind='metadata-response';complete=$true;collectorVersion=[string]$PSVersionTable.PSVersion;results=$payloads;completed=$completed.ToArray()};if($request.action -ceq 'createPrivateStorage'){$response.createdObjectId=$createdObjectId}
}catch{$code=1;$response=[ordered]@{format='sciautoharness';schemaVersion=1;kind='metadata-response';complete=$false;stage=$stage;failedPath=$failedPath;completed=$completed.ToArray();error=[ordered]@{name=$_.Exception.GetType().FullName;message=$_.Exception.Message}}}
[Console]::Out.Write(($response | ConvertTo-Json -Depth 30 -Compress))
exit $code
`;

const encodedMetadataCommand=Buffer.from(metadataScript,'utf16le').toString('base64');
let encodedPrivateMetadataCommand;
function metadataCommand(privateFile){
 if(!privateFile)return encodedMetadataCommand;
 if(!encodedPrivateMetadataCommand){
  // Keep the native helper below Windows' command-line length limit.
  const payload=gzipSync(privateFileMetadataScript+'\n'+metadataScript).toString('base64');
  const loader="$bytes=[Convert]::FromBase64String('"+payload+"');"+
   "$source=[IO.MemoryStream]::new($bytes);"+
   "$gzip=[IO.Compression.GZipStream]::new($source,[IO.Compression.CompressionMode]::Decompress);"+
   "$reader=[IO.StreamReader]::new($gzip,[Text.Encoding]::UTF8);"+
   "try{$code=$reader.ReadToEnd()}finally{$reader.Dispose()};"+
   "& ([ScriptBlock]::Create($code));exit $LASTEXITCODE";
  encodedPrivateMetadataCommand=Buffer.from(loader,'utf16le').toString('base64');
 }
 return encodedPrivateMetadataCommand;
}

let metadataExecutable;

async function metadataTool(){
 if(metadataExecutable)return metadataExecutable;
 const candidates=[path.join(process.env.ProgramFiles??'C:\\Program Files','PowerShell','7','pwsh.exe'),...(process.env.PATH??'').split(path.delimiter).map(p=>p.trim().replace(/^"|"$/g,'')).filter(p=>path.isAbsolute(p)).map(p=>path.join(p,'pwsh.exe'))];
 for(const p of candidates){if(await exists(p)){const s=await fs.lstat(p);if(s.isFile()&&!s.isSymbolicLink()){metadataExecutable=await fs.realpath(p);return metadataExecutable;}}}
 throw new Error('Existing PowerShell with complete directory stream support is required for Windows installation metadata; no dependency was installed.');
}

const stable=canonicalJson;

const sameSecurity=(a,b)=>stable(a)===stable(b);

function failWithRecovery(error,decorate){
 if(error?.code==='LOCK_CLEANUP_FAILED'){
  if(error.actionStatus==='failed'){error.actionError=decorate(error.actionError);error.cause=error.actionError;if(error.actionError.recovery)error.recovery=error.actionError.recovery;}
  throw error;
 }
 const decorated=decorate(error);if(error?.lockRoots)decorated.lockRoots=error.lockRoots;throw decorated;
}

async function metadata(requested,action='capture',privateFile=null){
 const unique=new Map();
 for(const x of requested){const p=path.resolve(x.path);if(!path.isAbsolute(x.path)||p.slice(path.parse(p).root.length).includes(':'))throw new Error('Unsafe metadata path');const key=process.platform==='win32'?p.toLowerCase():p;if(unique.has(key)){if(unique.get(key).kind!==x.kind)throw new Error('Conflicting metadata roles');continue;}unique.set(key,{...x,path:p});}
 const entries=[...unique.values()].sort((a,b)=>a.path.localeCompare(b.path)).map((x,i)=>({id:String(i),path:x.path,objectKind:x.kind,...(x.expected?{expected:x.expected}:{})}));
 if(!entries.length)return new Map();
 const creating=action==='createPrivateStorage',before=[];
 if(creating&&(entries.length!==1||entries[0].objectKind!=='directory'||await exists(entries[0].path)))throw new Error('Private transaction storage must be a new single directory.');
 for(const x of creating?[]:entries){const st=await fs.lstat(x.path,{bigint:true});if(st.isSymbolicLink()||(x.objectKind==='file'?(!st.isFile()||st.nlink!==1n):!st.isDirectory())||st.ino===0n)throw new Error('Unsafe metadata identity: '+x.path);before.push(x.objectKind==='file'?identity(st):directoryIdentity(st));}
 let extensions;
 if(privateFile){
  const fileIndex=entries.findIndex(x=>x.objectKind==='file');
  const parentIndex=entries.findIndex(x=>x.objectKind==='directory');
  if(process.platform!=='win32'||action!=='capture'||entries.length!==2||fileIndex<0||parentIndex<0||
     path.dirname(entries[fileIndex].path)!==entries[parentIndex].path||
     !sameIdentity(before[fileIndex],privateFile.identity)||!sameDirectory(before[parentIndex],privateFile.parent)||
     privateFile.identity.dev!==privateFile.parent.dev)throw new Error('Private file capture identity changed.');
  assertRecord(privateFile.parentSecurity,'installation-metadata');
  extensions={privateFile:{fileId:privateFile.identity.ino,parentId:privateFile.parent.ino,parentSecurity:privateFile.parentSecurity}};
 }
 const request=envelope('metadata-request',{action,entries,...(extensions?{extensions}:{})});
 assertRecord(request,'metadata-request');
 let observations,createdObjectId;
 if(process.platform==='win32'){
  const executable=await metadataTool(),p=childProcess.spawnSync(executable,['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',metadataCommand(privateFile)],{shell:false,windowsHide:true,input:Buffer.from(JSON.stringify(request),'utf8'),maxBuffer:16777216,timeout:30000});
  const raw=Buffer.isBuffer(p.stdout)?p.stdout:Buffer.alloc(0),rawError=Buffer.isBuffer(p.stderr)?p.stderr:Buffer.alloc(0);
  const processFacts={status:p.status,signal:p.signal,stderr:rawError.toString('utf8'),...(p.error?{error:p.error.message}:{}),stdoutBytes:raw.length};let result;
  try{if(!Buffer.isBuffer(p.stdout))throw new Error('Collector did not preserve raw stdout bytes.');result=assertRecord(parseJsonBytes(raw),'metadata-response');}
  catch(cause){throw Object.assign(new Error('Metadata collector did not return a complete current response.',{cause}),{metadataProcess:processFacts,metadataRaw:{stdout:raw,stderr:rawError}});}
  if(p.error||p.signal||p.status!==0||!result.complete)throw Object.assign(new Error('Metadata collection failed: '+(result.error?.message??p.error?.message??'incomplete collector')),{metadataFacts:result,metadataProcess:processFacts});
  if(creating){if(typeof result.createdObjectId!=='string'||!(/^[1-9][0-9]*$/).test(result.createdObjectId))throw new Error('Missing private creation identity.');createdObjectId=result.createdObjectId;}else if(Object.hasOwn(result,'createdObjectId'))throw new Error('Unexpected private creation identity.');
  if(result.results.length!==entries.length||stable(result.completed)!==stable(entries.map(x=>x.id)))throw new Error('Incomplete metadata inventory.');
  observations=result.results.map((o,i)=>{
   const x=entries[i];if(o.id!==x.id||o.path!==x.path||o.objectKind!==x.objectKind)throw new Error('Metadata identity/role response changed.');
   let previous=null;for(const stream of o.metadata.namedStreams){if(!stream.name||/[:\\/]/.test(stream.name)||previous!==null&&stream.name<=previous)throw new Error('Invalid named stream inventory.');previous=stream.name;}
   return o.metadata;
  });
 }else {if(creating){await fs.mkdir(entries[0].path,{mode:0o700});await fs.chmod(entries[0].path,0o700);}
 observations=await Promise.all(entries.map(async x=>{const st=await fs.lstat(x.path,{bigint:true});return envelope('installation-metadata',{platform:process.platform,coverage:'stat-only',uid:String(st.uid),gid:String(st.gid),mode:String(st.mode),limitations:['ACL','extendedAttributes','namedStreams']});}));}
 const output=new Map();
 for(let i=0;i<entries.length;i++){const x=entries[i],st=await fs.lstat(x.path,{bigint:true}),after=x.objectKind==='file'?identity(st):directoryIdentity(st);if(creating){if(!st.isDirectory()||st.isSymbolicLink()||st.ino===0n||await fs.realpath(x.path)!==x.path)throw new Error('Unsafe private storage identity.');if(process.platform==='win32'){if(String(st.ino)!==createdObjectId)throw new Error('Private creation identity changed.');assertPrivateDirectoryMetadata(observations[i]);}else if(st.uid!==BigInt(process.getuid())||(st.mode&0o777n)!==0o700n)throw new Error('Private storage owner/mode mismatch.');}
  else if(!(x.objectKind==='file'?sameIdentity(before[i],after):sameDirectory(before[i],after)))throw new Error('Metadata object changed during collection: '+x.path);if(action==='restoreArchive'&&!sameSecurity(observations[i],x.expected))throw new Error('Original metadata mismatch: '+x.path);output.set(x.path,observations[i]);if(creating)output.createdIdentity=directoryIdentity(st);}
 return output;
}



function assertPrivateDirectoryMetadata(value){
 assertRecord(value,'installation-metadata');if(value.platform!=='win32'||value.coverage!=='owner-group-dacl-attributes-ads'||value.namedStreams.length)throw new Error('Private storage metadata coverage mismatch.');

 const owner=value.ownerSid,ownerAliases=new Set([owner,...(owner==='S-1-5-18'?['SY']:owner==='S-1-5-19'?['LS']:owner==='S-1-5-20'?['NS']:owner.endsWith('-500')?['LA']:owner.endsWith('-501')?['LG']:[])]),wanted=new Set(owner==='S-1-5-18'?['owner']:['owner','system']),dacl=value.sddl.slice(value.sddl.indexOf('D:'));
 const aces=[...dacl.matchAll(/\(([^()]*)\)/g)].map(x=>x[1]),prefix=dacl.slice(0,dacl.indexOf('('));
 if(!/^D:P(?:AI)?$/.test(prefix)||aces.length!==wanted.size||dacl!==prefix+aces.map(x=>'('+x+')').join(''))throw new Error('Private storage DACL is not protected and exact.');
 for(const raw of aces){const a=raw.split(';'),principal=ownerAliases.has(a[5])?'owner':a[5]==='SY'||a[5]==='S-1-5-18'?'system':null;if(a.length!==6||a[0]!=='A'||a[1]!=='OICI'||a[2]!=='FA'||a[3]||a[4]||!wanted.delete(principal))throw new Error('Unexpected private storage ACE.');}
 if(wanted.size)throw new Error('Missing private storage principal.');
}
async function createPrivateTransactionStorage(directory,parentIdentity){
 const parent=path.dirname(directory);if(!parentIdentity)throw new Error('Missing bound storage parent.');await assertDirectory(parent,parentIdentity);
 const creation=await metadata([{path:directory,kind:'directory'}],'createPrivateStorage'),first=creation.get(directory),created=creation.createdIdentity;await assertDirectory(directory,created);
 await assertDirectory(parent,parentIdentity);const st=await fs.lstat(directory,{bigint:true});if(String(st.dev)!==parentIdentity.dev||path.dirname(await fs.realpath(directory))!==await fs.realpath(parent))throw new Error('Private storage parent or volume changed.');
 const second=(await metadata([{path:directory,kind:'directory'}])).get(directory);await assertDirectory(directory,created);await assertDirectory(parent,parentIdentity);if(!sameSecurity(first,second))throw new Error('Private storage security changed before sensitive writes.');
 return {identity:created,security:first};
}


async function openPrivateFile(file,parentIdentity,parentSecurity){
 let handle;
 try{
  await assertDirectory(path.dirname(file),parentIdentity);handle=await fs.open(file,'wx',0o600);
  if(process.platform!=='win32')await handle.chmod(0o600);
  const opened=await handle.stat({bigint:true});if(!opened.isFile()||opened.nlink!==1n||opened.ino===0n)throw new Error('Unsafe opened private file.');
  await assertDirectory(path.dirname(file),parentIdentity);await assertTarget(file,identity(opened),hash(Buffer.alloc(0)));
  if(process.platform==='win32'){
   const parent=path.dirname(file);
   const observed=await metadata([{path:file,kind:'file'},{path:parent,kind:'directory'}],'capture',
    {identity:identity(opened),parent:parentIdentity,parentSecurity});
   if(!sameSecurity(observed.get(parent),parentSecurity))throw new Error('Private storage security changed before file write.');
   const security=observed.get(file);
   if(security.ownerSid!==parentSecurity.ownerSid||security.namedStreams.length)throw new Error('Private file security differs from private storage policy.');
  }else if(opened.uid!==BigInt(process.getuid())||(opened.mode&0o777n)!==0o600n)throw new Error('Private file owner/mode mismatch.');
  const current=await handle.stat({bigint:true});if(!sameIdentity(identity(opened),identity(current))||current.size!==0n)throw new Error('Opened private file changed.');
  await assertTarget(file,identity(opened),hash(Buffer.alloc(0)));await assertDirectory(path.dirname(file),parentIdentity);return handle;
 }catch(error){if(handle)try{await handle.close();}catch(closeError){throw Object.assign(new Error(error.message+'; private file close: '+closeError.message,{cause:error}),{operationError:error,closeError});}throw error;}
}
async function writePrivateFile(file,bytes,parentIdentity,parentSecurity){
 const handle=await openPrivateFile(file,parentIdentity,parentSecurity);let error;
 try{await handle.writeFile(bytes);}catch(e){error=e;}
 try{await handle.close();}catch(e){if(error)throw Object.assign(new Error(error.message+'; private file close: '+e.message,{cause:error}),{operationError:error,closeError:e});throw e;}
 if(error)throw error;
}

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const names=inventory.files;

function parents(files){const dirs=new Set(['']);for(const f of files){let d=path.posix.dirname(f);while(d!=='.'){dirs.add(d);d=path.posix.dirname(d);}}return [...dirs].sort((a,b)=>a.length-b.length||a.localeCompare(b));}

const dirs=parents(names);

const mapping=tree=>Object.fromEntries((tree?.files??[]).map(f=>[f.relative,f.sha256]));

const body=tree=>tree===null?null:{files:tree.files,directories:tree.directories};

function sameTree(a,b){return stable(body(a))===stable(body(b));}

async function root(raw){
 if(typeof raw!=='string'||!path.isAbsolute(raw))throw new Error('Declare absolute installation roots.');
 const p=path.resolve(raw),parsed=path.parse(p);let cursor=parsed.root;
 for(const part of p.slice(parsed.root.length).split(path.sep).filter(Boolean)){cursor=path.join(cursor,part);if(!await exists(cursor))break;const s=await fs.lstat(cursor);if(s.isSymbolicLink()||!s.isDirectory())throw new Error('Unsafe linked installation ancestor: '+cursor);}
 return futureRoot(p);
}

async function tree(root){
 if(!await exists(root))return null;
 const directories=[],files=[];
 async function walk(dir,relative){
  directories.push({relative,identity:await inspectDirectory(dir),security:null});
  for(const entry of (await fs.readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
   const file=path.join(dir,entry.name),rel=relative?relative+'/'+entry.name:entry.name;
   if(entry.isSymbolicLink())throw new Error('Unsafe linked tree member: '+file);
   if(entry.isDirectory())await walk(file,rel);else{const observed=await inspect(file);files.push({relative:rel,...observed,security:null});}
  }
 }
 await walk(root,'');files.sort((a,b)=>a.relative.localeCompare(b.relative));directories.sort((a,b)=>a.relative.length-b.relative.length||a.relative.localeCompare(b.relative));
 return{root,files,directories};
}

async function fileSnapshot(file){const current=await inspect(file);return{path:file,...current,security:null};}

function treeEntries(tree){return tree?[...tree.directories.map(d=>({path:path.join(tree.root,d.relative),kind:'directory'})),...tree.files.map(f=>({path:path.join(tree.root,f.relative),kind:'file'}))]:[];}

function setTreeMetadata(tree,metadata){if(!tree)return;for(const d of tree.directories)d.security=metadata.get(path.join(tree.root,d.relative));for(const f of tree.files)f.security=metadata.get(path.join(tree.root,f.relative));}

function treeShape(tree,allowedFiles,allowedDirs){if(!tree)return;for(const f of tree.files)if(!allowedFiles.includes(f.relative))throw new Error('Existing skill has extra files; refuse automatic overwrite: '+f.relative);for(const d of tree.directories)if(!allowedDirs.includes(d.relative))throw new Error('Existing skill has extra or unrecognized directory: '+d.relative);}

async function containerBinding(p,overlay){
 const supplied=overlay?.bindings.find(b=>b.path===p);
 if(supplied){
  await assertDirectory(supplied.anchor.path,supplied.anchor.identity);
  const actual=await inspectDirectory(p);
  if(supplied.beforeIdentity){if(!sameDirectory(actual,supplied.beforeIdentity))throw new Error('Installation root identity changed: '+p);}
  else{
   let cursor=p;
   while(cursor!==supplied.anchor.path){if(await exists(cursor)){const id=overlay.created.get(cursor);if(!id||!sameDirectory(await inspectDirectory(cursor),id))throw new Error('New installation root appeared: '+cursor);}cursor=path.dirname(cursor);}
  }
  return structuredClone(supplied);
 }
 const beforeIdentity=await inspectDirectory(p);let ancestor=p;while(!await exists(ancestor))ancestor=path.dirname(ancestor);
 return{path:p,beforeIdentity,security:null,anchor:{path:ancestor,identity:await inspectDirectory(ancestor),security:null}};
}

function planBody(plan){const{digest,summary,...body}=plan;return body;}

function validateInstallPlan(plan,sourceRequired=true){
 assertRecord(plan,'install-plan');const profile=hostProfile(plan.host);
 if(plan.digest!==hash(canonicalJson(planBody(plan))))throw new Error('Install plan digest mismatch; review a fresh current preview.');
 if(![plan.source,plan.hostHome,plan.skillRoot].every(path.isAbsolute)||sourceRequired&&plan.source!==skillSource||plan.instructionFile!==profile.instructionFile||plan.targetSkill!==path.join(plan.skillRoot,canonicalName))throw new Error('Installation host/source/root binding changed.');
 if(plan.backupDirectory!==path.join(plan.hostHome,'harness-install-backups',plan.transactionId))throw new Error('Invalid fixed backup storage.');
 if(plan.sourceSnapshot.root!==plan.source||stable(plan.sourceSnapshot.files.map(f=>f.relative).sort())!==stable(names))throw new Error('Invalid current source inventory.');
 treeShape(plan.canonicalBefore,names,dirs);
 if(stable(plan.directories.map(d=>d.path))!==stable(dirs.map(d=>path.join(plan.targetSkill,d))))throw new Error('Invalid directory journal.');
 if(stable(plan.containers.map(c=>c.path))!==stable([...new Set([plan.hostHome,plan.skillRoot,path.dirname(plan.backupDirectory)])]))throw new Error('Invalid container binding.');
 if(plan.host==='codex'?plan.configuration?.path!==path.join(plan.hostHome,'config.toml'):plan.configuration!==null)throw new Error('Invalid configuration role.');
 if(plan.instructionsBefore.path!==path.join(plan.hostHome,profile.instructionFile))throw new Error('Invalid instruction snapshot role.');
 if(new Set(plan.changes.map(c=>process.platform==='win32'?c.target.toLowerCase():c.target)).size!==plan.changes.length||plan.changes.length>names.length+1)throw new Error('Duplicate or excessive installation targets.');
 for(const c of plan.changes){
  if(c.role==='instructions'){if(c.target!==path.join(plan.hostHome,profile.instructionFile)||c.kind!=='append-rule'||Buffer.from(c.bytes,'base64').toString('base64')!==c.bytes||hash(Buffer.from(c.bytes,'base64'))!==c.after)throw new Error('Instruction change binding mismatch.');}
  else if(!names.includes(c.relative)||c.target!==path.join(plan.targetSkill,c.relative)||c.source!==path.join(plan.source,c.relative)||c.kind!==(c.before===null?'create-skill':'replace-skill'))throw new Error('Canonical change binding mismatch.');
  if((c.before===null)!==(c.beforeIdentity===null)||(c.before===null)!==(c.beforeSecurity===null))throw new Error('Before hash/identity/security parity mismatch.');
 }
 if(plan.summary.changedFiles!==plan.changes.length)throw new Error('Incorrect derived installation summary.');
 if(plan.summary.agentsRule!==(plan.reviewedRule?plan.reviewedRule.after+'\n':defaultRule(plan.targetSkill,plan.host))||plan.summary.metadataCoverage!==(process.platform==='win32'?'owner-group-dacl-attributes-ads':'stat-only'))throw new Error('Derived instruction/metadata summary differs from the reviewed facts.');
 return profile;
}


async function previewCurrent(options={},internal={}){
 if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).some(k=>!['host','hostHome','skillRoot','replaceSkill','reviewedRule','extensions'].includes(k)))throw new Error('Unknown current installation option.');
 const {host='codex',replaceSkill=false,reviewedRule,extensions}=options;let {hostHome,skillRoot}=options;
 if(typeof replaceSkill!=='boolean')throw new Error('replaceSkill must be boolean.');
 if(extensions!==undefined)assertStructure(extensions,'extensions');
 const profile=hostProfile(host);hostHome=await root(hostHome);skillRoot=await root(skillRoot);
 const targetSkill=path.join(skillRoot,canonicalName),instructionPath=path.join(hostHome,profile.instructionFile),transactionId=internal.transactionId??randomUUID(),backupDirectory=path.join(hostHome,'harness-install-backups',transactionId);
 if(!uuid.test(transactionId))throw new Error('Invalid transaction identity.');
 if(inside(skillSource,targetSkill)||inside(targetSkill,skillSource)||inside(targetSkill,hostHome)||inside(skillSource,hostHome))throw new Error('Source, target and instruction home overlap.');
 for(const name of profile.overrideFiles){const p=path.join(hostHome,name);if(await exists(p)&&(await fs.readFile(p,'utf8')).trim())throw new Error('Nearby instruction override requires review: '+name);}
 const sourceSnapshot=await tree(skillSource);if(!sourceSnapshot||stable(sourceSnapshot.files.map(f=>f.relative).sort())!==stable(names))throw new Error('Unexpected current source inventory.');treeShape(sourceSnapshot,names,dirs);
 const canonicalBefore=await tree(targetSkill);treeShape(canonicalBefore,names,dirs);
 const instructionsBefore=await fileSnapshot(instructionPath),configuration=host==='codex'?await fileSnapshot(path.join(hostHome,'config.toml')):null;
 const oldBytes=instructionsBefore.identity?await fs.readFile(instructionPath):Buffer.alloc(0);
 if(reviewedRule){assertStructure(reviewedRule,'reviewedRule');if(!reviewedRule.after.startsWith(start)||!reviewedRule.after.endsWith(end)||[...reviewedRule.after.matchAll(/<!--\s*sciautoharness\s*:/g)].length!==2)throw new Error('Reviewed after requires one exact current marker pair.');}
 const rule=reviewedRule?reviewedRule.after+'\n':defaultRule(targetSkill,host),next=managedReplacement(oldBytes,rule,reviewedRule);
 if(await exists(backupDirectory))throw new Error('Designated transaction storage already exists.');
 const containers=[];for(const p of [...new Set([hostHome,skillRoot,path.dirname(backupDirectory)])])containers.push(await containerBinding(p,internal.overlay));
 const targets=[...treeEntries(sourceSnapshot),...treeEntries(canonicalBefore),...containers.flatMap(c=>[...(c.beforeIdentity?[{path:c.path,kind:'directory'}]:[]),{path:c.anchor.path,kind:'directory'}]),...(instructionsBefore.identity?[{path:instructionPath,kind:'file'}]:[]),...(configuration?.identity?[{path:configuration.path,kind:'file'}]:[])];
 const observed=await metadata(targets);for(const t of [sourceSnapshot,canonicalBefore])setTreeMetadata(t,observed);
 for(const c of containers){c.security=c.beforeIdentity?observed.get(c.path):null;c.anchor.security=observed.get(c.anchor.path);}
 instructionsBefore.security=instructionsBefore.identity?observed.get(instructionPath):null;if(configuration)configuration.security=configuration.identity?observed.get(configuration.path):null;
 const changes=[];
 if(!next.equals(oldBytes))changes.push({role:'instructions',target:instructionPath,before:instructionsBefore.sha256,beforeIdentity:instructionsBefore.identity,beforeSecurity:instructionsBefore.security,after:hash(next),kind:'append-rule',bytes:next.toString('base64')});
 for(const f of sourceSnapshot.files){const before=canonicalBefore?.files.find(x=>x.relative===f.relative);if(before?.sha256===f.sha256)continue;if(before&&!replaceSkill)throw new Error('Different skill exists; review replacement explicitly.');changes.push({role:'canonical',relative:f.relative,target:path.join(targetSkill,f.relative),source:path.join(skillSource,f.relative),sourceMode:Number(BigInt(f.identity.mode)&0o777n),before:before?.sha256??null,beforeIdentity:before?.identity??null,beforeSecurity:before?.security??null,after:f.sha256,kind:before?'replace-skill':'create-skill'});}
 const directories=dirs.map(relative=>{const before=canonicalBefore?.directories.find(d=>d.relative===relative);return {path:path.join(targetSkill,relative),beforeIdentity:before?.identity??null,beforeSecurity:before?.security??null};});
 const facts=envelope('install-plan',{host,hostHome,instructionFile:profile.instructionFile,skillRoot,targetSkill,source:skillSource,transactionId,backupDirectory,replaceSkill,...(reviewedRule?{reviewedRule}:{}),...(extensions?{extensions}:{}),sourceSnapshot,canonicalBefore,instructionsBefore,configuration,containers,directories,changes});
 const plan={...facts,digest:hash(canonicalJson(facts)),summary:{changedFiles:changes.length,configTomlChanged:false,dependenciesInstalled:false,modelCalled:false,agentsRule:rule,metadataCoverage:process.platform==='win32'?'owner-group-dacl-attributes-ads':'stat-only'}};validateInstallPlan(plan);return plan;
}


export async function previewInstall(options={}){return previewCurrent(options);}

async function createContainer(binding,created){
 if(binding.beforeIdentity){await assertDirectory(binding.path,binding.beforeIdentity);return;}
 const segments=[];let p=binding.path;while(p!==binding.anchor.path){segments.unshift(p);p=path.dirname(p);}
 await assertDirectory(binding.anchor.path,binding.anchor.identity);
 for(const dir of segments){if(created.has(dir)){await assertDirectory(dir,created.get(dir));continue;}if(await exists(dir))throw new Error('New installation root appeared: '+dir);await fs.mkdir(dir);created.set(dir,await inspectDirectory(dir));}
}

async function snapshots(plan){
 const canonical=await tree(plan.targetSkill),instructions=await fileSnapshot(path.join(plan.hostHome,plan.instructionFile)),configuration=plan.configuration?await fileSnapshot(plan.configuration.path):null;
 const source=await tree(plan.source);
 const containerPaths=plan.containers.flatMap(c=>[c.path,c.anchor.path]),storagePaths=[path.dirname(plan.backupDirectory),plan.backupDirectory,];
 const paths=[...new Set([...containerPaths,...storagePaths])],containers=[];
 for(const p of paths){const id=await inspectDirectory(p);if(id)containers.push({path:p,identity:id,security:null});}
 const backups=[];for(const [i,c]of plan.changes.entries())if(c.before)backups.push(await fileSnapshot(path.join(plan.backupDirectory,i+'.bin')));
 const planFile=await fileSnapshot(path.join(plan.backupDirectory,'plan.json'));
 const observedMetadata=await metadata([...treeEntries(source),...treeEntries(canonical),...containers.map(c=>({path:c.path,kind:'directory'})),...backups.map(b=>({path:b.path,kind:'file'})),{path:planFile.path,kind:'file'},...(instructions.identity?[{path:instructions.path,kind:'file'}]:[]),...(configuration?.identity?[{path:configuration.path,kind:'file'}]:[])]);
 for(const t of [source,canonical,])setTreeMetadata(t,observedMetadata);for(const c of containers)c.security=observedMetadata.get(c.path);
 instructions.security=instructions.identity?observedMetadata.get(instructions.path):null;if(configuration)configuration.security=configuration.identity?observedMetadata.get(configuration.path):null;
 for(const b of [...backups,planFile])b.security=observedMetadata.get(b.path);
 return{source,canonical,instructions,configuration,containers,backups,planFile};
}

function equalFile(a,b){return stable(a)===stable(b);}

async function rollbackSnapshots(plan){
 const canonical=await tree(plan.targetSkill),instructions=await fileSnapshot(path.join(plan.hostHome,plan.instructionFile)),configuration=plan.configuration?await fileSnapshot(plan.configuration.path):null;
 const observedMetadata=await metadata([...treeEntries(canonical),...(instructions.identity?[{path:instructions.path,kind:'file'}]:[]),...(configuration?.identity?[{path:configuration.path,kind:'file'}]:[])]);
 for(const t of [canonical])setTreeMetadata(t,observedMetadata);instructions.security=instructions.identity?observedMetadata.get(instructions.path):null;if(configuration)configuration.security=configuration.identity?observedMetadata.get(configuration.path):null;
 return{canonical,instructions,configuration};
}

async function rollbackCurrentInstall(manifest,record,originalManifest){
 let stage='manifest-preflight',target=manifest,sourcePath=null,completedTargets=0;
 try{
  assertRecord(record,'install-record');
  if(record.status!=='installed'||record.bindingDigest!==manifestBinding(record))throw new Error('Rollback requires a completed, unmodified current installation record.');
  const manifestSnapshot=originalManifest;await assertTarget(manifest,manifestSnapshot.identity,manifestSnapshot.sha256);if(stable(await json(manifest))!==stable(record))throw new Error('Installation manifest changed before preflight.');
  const manifestSecurity=(await metadata([{path:manifest,kind:'file'}])).get(manifest);
  const backupDirectory=path.join(record.hostHome,'harness-install-backups',record.transactionId);
  if(manifest!==path.join(backupDirectory,'rollback.json')||record.planFile?.path!==path.join(backupDirectory,'plan.json'))throw new Error('Rollback manifest/plan storage is outside fixed installation backup.');
  for(const p of [record.hostHome,record.skillRoot,backupDirectory])await root(p);
  await assertTarget(record.planFile.path,record.planFile.identity,record.planFile.sha256);
  const plan=await json(record.planFile.path);validateInstallPlan(plan,false);
  if(plan.digest!==record.planDigest||plan.backupDirectory!==backupDirectory)throw new Error('Original reviewed plan differs from manifest.');
  for(const key of ['format','schemaVersion','host','hostHome','instructionFile','skillRoot','targetSkill','source','transactionId','sourceSnapshot','canonicalBefore','instructionsBefore','configuration','extensions'])if(stable(record[key])!==stable(plan[key]))throw new Error('Rollback manifest conflicts with original plan: '+key);
  if(stable(record.containersBefore)!==stable(plan.containers)||record.changes?.length!==plan.changes.length||record.directories?.length!==plan.directories.length||record.completedTargets!==plan.changes.length)throw new Error('Incomplete installation journal.');
  if(!record.canonicalAfter||!equalMapping(mapping(record.canonicalAfter),mapping(plan.sourceSnapshot))||stable(record.canonicalAfter.directories.map(d=>d.relative))!==stable(dirs))throw new Error('Installed inventory is not the complete canonical source.');
  for(const f of plan.canonicalBefore?.files??[]){const after=record.canonicalAfter.files.find(x=>x.relative===f.relative);if(!after||!sameIdentity(after.identity,f.identity)||!sameSecurity(after.security,f.security))throw new Error('Original canonical file identity/security cannot be rebound.');}
  for(const d of plan.canonicalBefore?.directories??[]){const after=record.canonicalAfter.directories.find(x=>x.relative===d.relative);if(!after||!sameDirectory(after.identity,d.identity)||!sameSecurity(after.security,d.security))throw new Error('Original canonical directory identity/security cannot be rebound.');}
  if(plan.instructionsBefore.identity&&(!sameIdentity(record.instructionsAfter?.identity,plan.instructionsBefore.identity)||!sameSecurity(record.instructionsAfter?.security,plan.instructionsBefore.security)))throw new Error('Original instruction identity/security cannot be rebound.');
  for(const c of plan.containers)for(const original of [...(c.beforeIdentity?[{path:c.path,identity:c.beforeIdentity,security:c.security}]:[]),c.anchor]){const after=record.containersAfter.find(x=>x.path===original.path);if(!after||!sameDirectory(after.identity,original.identity)||!sameSecurity(after.security,original.security))throw new Error('Original container/anchor identity/security cannot be rebound.');}
  for(let i=0;i<plan.changes.length;i++){
   const c=record.changes[i],original=plan.changes[i];for(const key of Object.keys(original))if(stable(c[key])!==stable(original[key]))throw new Error('Rollback change differs from original plan.');
   if(!c.written||!c.afterIdentity||c.backup!==(c.before?path.join(backupDirectory,i+'.bin'):null)||c.backupSaved!==!!c.before)throw new Error('Invalid backup/write progress.');
   const after=c.role==='instructions'?record.instructionsAfter:record.canonicalAfter.files.find(f=>f.relative===c.relative);if(after?.sha256!==c.after||!sameIdentity(after.identity,c.afterIdentity))throw new Error('Installed change is disconnected from final snapshot.');
  }
  for(let i=0;i<plan.directories.length;i++){const d=record.directories[i],original=plan.directories[i];for(const key of Object.keys(original))if(stable(d[key])!==stable(original[key]))throw new Error('Rollback directory differs from original plan.');const after=record.canonicalAfter.directories.find(x=>path.join(plan.targetSkill,x.relative)===d.path);if(d.created!==(d.beforeIdentity===null)||!after||!sameDirectory(d.afterIdentity,after.identity)||!sameSecurity(d.afterSecurity,after.security))throw new Error('Invalid canonical directory progress.');}
  const expectedContainers=[...new Set([...plan.containers.flatMap(c=>[c.path,c.anchor.path]),path.dirname(backupDirectory),backupDirectory,])];
  if(stable(record.containersAfter.map(c=>c.path))!==stable(expectedContainers))throw new Error('Invalid installation storage identity journal.');
  return await lockedRoots([plan.hostHome,plan.skillRoot],async()=>{
   stage='locked-preflight';target=null;
   await assertTarget(manifest,manifestSnapshot.identity,manifestSnapshot.sha256);
   await assertTarget(record.planFile.path,record.planFile.identity,record.planFile.sha256);
   for(const c of record.containersAfter){await root(c.path);await assertDirectory(c.path,c.identity);}
   const observedMetadata=await metadata([...record.containersAfter.map(c=>({path:c.path,kind:'directory'})),{path:manifest,kind:'file'},{path:record.planFile.path,kind:'file'},...record.changes.filter(c=>c.backup).map(c=>({path:c.backup,kind:'file'}))]);for(const c of record.containersAfter)if(!sameSecurity(observedMetadata.get(c.path),c.security))throw new Error('Installation container security/streams changed: '+c.path);if(!sameSecurity(observedMetadata.get(record.planFile.path),record.planFile.security))throw new Error('Reviewed plan observedMetadata changed.');if(!sameSecurity(observedMetadata.get(manifest),manifestSecurity))throw new Error('Installation manifest security/streams changed during preflight.');
   const current=await rollbackSnapshots(plan);
   if(!sameTree(current.canonical,record.canonicalAfter)||!equalFile(current.instructions,record.instructionsAfter)||!equalFile(current.configuration,plan.configuration))throw new Error('Installed target/configuration identity/content/observedMetadata changed; refuse rollback.');
   const prepared=[];for(const c of record.changes){target=c.target;sourcePath=c.backup;await assertTarget(c.target,c.afterIdentity,c.after);let bytes=null;if(c.backup){const st=await fileSnapshot(c.backup);st.security=observedMetadata.get(c.backup);if(st.sha256!==c.before||!equalFile(st,c.backupSnapshot))throw new Error('Backup content/identity/observedMetadata changed; refuse rollback.');bytes=await fs.readFile(c.backup);if(hash(bytes)!==c.before)throw new Error('Backup input changed; refuse rollback.');}prepared.push({change:c,bytes});}sourcePath=null;
   const journal=journalWriter(manifest,record.containersAfter.find(c=>c.path===backupDirectory).identity,manifestSnapshot,record.containersAfter.find(c=>c.path===backupDirectory).security);const persist=async()=>journal(record);const perform=async(action,source=null)=>{operationFact(record,'rollback',stage,target,'intent',null,source);await persist();try{await action();operationFact(record,'rollback',stage,target,'confirmed',null,source);}catch(e){operationFact(record,'rollback',stage,target,'failed',e,source);try{await persist();}catch(journalError){throw combineJournalError(e,journalError);}throw e;}await persist();};
   stage='rollback-prepared';target=manifest;record.status='rollback-prepared';record.rollbackProgress={completedTargets:0,removedDirectories:[]};operationFact(record,'rollback',stage,target,'intent');await persist();
   stage='restore-targets';for(const {change:c,bytes}of prepared){target=c.target;sourcePath=c.backup;await perform(async()=>{await assertTarget(c.target,c.afterIdentity,c.after);if(c.beforeIdentity)await writeTarget(c,bytes,c.afterIdentity,c.after);else await fs.unlink(c.target);completedTargets++;record.rollbackProgress.completedTargets=completedTargets;},sourcePath);}sourcePath=null;
   stage='remove-created-directories';for(const d of [...record.directories].reverse()){if(!d.created)continue;target=d.path;await perform(async()=>{await assertDirectory(d.path,d.afterIdentity);await fs.rmdir(d.path);record.rollbackProgress.removedDirectories.push(d.path);});}
   stage='restore-archive-attributes';target=null;await perform(()=>metadata(record.changes.filter(c=>c.beforeIdentity).map(c=>({path:c.target,kind:'file',expected:c.beforeSecurity})),'restoreArchive'));
   stage='verify-restored';const after=await rollbackSnapshots(plan);
   if(!sameTree(after.canonical,plan.canonicalBefore)||!equalFile(after.instructions,plan.instructionsBefore)||!equalFile(after.configuration,plan.configuration))throw new Error('Restored original canonical/instruction/configuration differs.');
   const containerMetadata=await metadata(record.containersAfter.map(c=>({path:c.path,kind:'directory'})));for(const c of record.containersAfter){await assertDirectory(c.path,c.identity);if(!sameSecurity(containerMetadata.get(c.path),c.security))throw new Error('Container/anchor observedMetadata changed during restoration: '+c.path);}
   stage='rolled-back-manifest';target=manifest;record.status='rolled-back';operationFact(record,'rollback',stage,target,'confirmed');await persist();return{status:'rolled-back',restoredFiles:completedTargets,backupPreserved:path.dirname(manifest),rollbackManifest:manifest};
  });
 }catch(error){failWithRecovery(error,e=>Object.assign(new Error(`${e?.message??String(e)}. Rollback ${stage}. Failed target: ${target??'preflight'}. No automatic retry or rollback of a partial restoration was attempted.`,{cause:e}),{recovery:{operation:'rollback',stage,failedTarget:target,source:sourcePath,completedTargets,totalTargets:record.changes?.length??0,manifest,backupDirectory:path.dirname(manifest),metadataFacts:e?.metadataFacts,metadataProcess:e?.metadataProcess}}));}
}


function manifestBinding(record){const{bindingDigest,status,...bound}=record;return hash(canonicalJson(bound));}

async function stableJournal(file){
 const start=await fs.lstat(file,{bigint:true});if(!start.isFile()||start.isSymbolicLink()||start.nlink!==1n||start.ino===0n)throw new Error('Journal must be an ordinary single-link file.');
 const handle=await fs.open(file,'r');let first,last,bytes,error;
 try{first=await handle.stat({bigint:true});bytes=await handle.readFile();last=await handle.stat({bigint:true});}catch(e){error=e;}
 try{await handle.close();}catch(e){if(error)throw new Error(error.message+'; journal close: '+e.message,{cause:error});throw e;}
 if(error)throw error;const end=await fs.lstat(file,{bigint:true}),same=(a,b)=>['dev','ino','mode','nlink','size','ctimeNs','mtimeNs'].every(k=>a[k]===b[k]);
 if(!same(start,first)||!same(first,last)||!same(last,end))throw new Error('Journal changed during stable read.');
 return {identity:identity(end),sha256:hash(bytes),bytes};
}
function journalWriter(file,parentIdentity,initial=null,parentSecurity=null){
 let expected=initial;
 return async record=>{
  record.bindingDigest=manifestBinding(record);assertRecord(record,'install-record');
  const bytes=Buffer.from(JSON.stringify(record,null,2)+'\n'),temp=file+'.'+randomUUID()+'.tmp';let created=false,published=false,handle,temporaryIdentity;const errors=[];
  try{
   await assertDirectory(path.dirname(file),parentIdentity);
   if(expected){const current=await stableJournal(file);if(!sameIdentity(current.identity,expected.identity)||current.sha256!==expected.sha256)throw new Error('Owned journal identity/content changed.');}
   else if(await exists(file))throw new Error('Unknown transaction journal appeared.');
   handle=await openPrivateFile(temp,parentIdentity,parentSecurity);created=true;temporaryIdentity=identity(await handle.stat({bigint:true}));await handle.writeFile(bytes);const closing=handle;handle=null;await closing.close();
   await assertDirectory(path.dirname(file),parentIdentity);
   if(expected){const current=await stableJournal(file);if(!sameIdentity(current.identity,expected.identity)||current.sha256!==expected.sha256)throw new Error('Owned journal changed before publication.');published='unconfirmed';await fs.rename(temp,file);created=false;published=true;}
   else{published='unconfirmed';await fs.link(temp,file);published=true;}
  }catch(e){errors.push(e);}
  if(handle)try{await handle.close();}catch(e){errors.push(e);}
  if(created)try{const st=await fs.lstat(temp,{bigint:true});if(!st.isFile()||st.isSymbolicLink()||!temporaryIdentity||String(st.dev)!==temporaryIdentity.dev||String(st.ino)!==temporaryIdentity.ino||hash(await fs.readFile(temp))!==hash(bytes))throw new Error('Unknown temporary journal identity/content preserved: '+temp);await fs.unlink(temp);created=false;}catch(e){errors.push(e);}
  if(!errors.length&&published===true)try{const actual=await stableJournal(file);if(!sameIdentity(actual.identity,temporaryIdentity)||actual.sha256!==hash(bytes))throw new Error('Published journal differs from prepared current bytes.');expected=actual;}catch(e){errors.push(e);}
  if(errors.length)throw Object.assign(new Error(errors.map(e=>e.message).join('; ')+'. Journal published: '+published),{journalPublished:published,causes:errors});
 };
}
function operationFact(record,operation,stage,target,outcome,error=null,source=null){record.operations.push({sequence:record.operations.length,operation,stage,target:target??null,source,outcome,error:error?{name:error.name??'Error',message:error.message??String(error),...(typeof error.code==='string'||Number.isInteger(error.code)?{code:error.code}:{})}:null});}
function combineJournalError(operationError,journalError){return Object.assign(new Error(`${operationError?.message??String(operationError)}; failed-operation journal also failed: ${journalError.message}`,{cause:operationError}),{operationError,journalError,...(journalError.journalFailure?{journalFailure:journalError.journalFailure}:{}),...(journalError.journalPublished!==undefined?{journalPublished:journalError.journalPublished}:{}),...(operationError.metadataFacts?{metadataFacts:operationError.metadataFacts}:{}),...(operationError.metadataProcess?{metadataProcess:operationError.metadataProcess}:{}),...(operationError.metadataRaw!==undefined?{metadataRaw:operationError.metadataRaw}:{})});}
const optionsFromPlan=plan=>({host:plan.host,hostHome:plan.hostHome,skillRoot:plan.skillRoot,replaceSkill:plan.replaceSkill,...(plan.reviewedRule?{reviewedRule:plan.reviewedRule}:{}),...(plan.extensions?{extensions:plan.extensions}:{})});
export async function applyInstall(plan){
 validateInstallPlan(plan);const created=new Map();let stage='prepare-containers',target=null,record,manifest=path.join(plan.backupDirectory,'rollback.json');
 try{
  const unlocked=await previewCurrent(optionsFromPlan(plan),{transactionId:plan.transactionId});if(unlocked.digest!==plan.digest)throw new Error('Source or target changed after preview; review a fresh plan.');
  for(const p of [plan.hostHome,plan.skillRoot]){target=p;await createContainer(plan.containers.find(c=>c.path===p),created);}
  return await lockedRoots([plan.hostHome,plan.skillRoot],async()=>{
   stage='locked-preflight';target=null;const current=await previewCurrent(optionsFromPlan(plan),{transactionId:plan.transactionId,overlay:{bindings:plan.containers,created}});if(current.digest!==plan.digest)throw new Error('Source/target changed after preview.');
   if(!current.changes.length)return {status:'already-installed',changedFiles:0};
   const changes=current.changes.map((c,i)=>({...c,backup:c.before?path.join(current.backupDirectory,i+'.bin'):null,backupSaved:false,written:false,afterIdentity:null,backupSnapshot:null}));
   record=envelope('install-record',{status:'prepared',host:current.host,hostHome:current.hostHome,instructionFile:current.instructionFile,skillRoot:current.skillRoot,targetSkill:current.targetSkill,source:current.source,transactionId:current.transactionId,planDigest:current.digest,bindingDigest:'0'.repeat(64),planFile:null,sourceSnapshot:current.sourceSnapshot,canonicalBefore:current.canonicalBefore,instructionsBefore:current.instructionsBefore,configuration:current.configuration,containersBefore:current.containers,containersAfter:[],directories:current.directories.map(d=>({...d,created:false,afterIdentity:d.beforeIdentity,afterSecurity:d.beforeSecurity})),changes,completedTargets:0,canonicalAfter:null,instructionsAfter:null,createdContainers:[],operations:[],...(current.extensions?{extensions:current.extensions}:{})});
   stage='prepare-storage';target=path.dirname(current.backupDirectory);await createContainer(current.containers.find(c=>c.path===target),created);target=current.backupDirectory;
   const storage=await createPrivateTransactionStorage(current.backupDirectory,created.get(path.dirname(current.backupDirectory))??current.containers.find(c=>c.path===path.dirname(current.backupDirectory)).beforeIdentity),transactionIdentity=storage.identity;
   const planFile=path.join(current.backupDirectory,'plan.json');await writePrivateFile(planFile,Buffer.from(JSON.stringify(current,null,2)+'\n'),transactionIdentity,storage.security);record.planFile=await fileSnapshot(planFile);record.createdContainers=[...created].map(([p,id])=>({path:p,identity:id}));
   const journal=journalWriter(manifest,transactionIdentity,null,storage.security);const persist=async()=>{try{await journal(record);}catch(e){throw Object.assign(e,{journalFailure:{stage,operationTarget:target,manifest}});}};
   stage='prepared-manifest';target=manifest;operationFact(record,'install',stage,target,'intent');await persist();
   const perform=async(action,source=null)=>{operationFact(record,'install',stage,target,'intent',null,source);await persist();try{await action();operationFact(record,'install',stage,target,'confirmed',null,source);}catch(e){operationFact(record,'install',stage,target,'failed',e,source);try{await persist();}catch(journalError){throw combineJournalError(e,journalError);}throw e;}await persist();};
   stage='backup';for(const c of changes){if(!c.backup)continue;target=c.backup;await perform(async()=>{await assertExpectedTarget(c.target,c.beforeIdentity,c.before);const bytes=await fs.readFile(c.target);if(hash(bytes)!==c.before)throw new Error('Backup input changed.');await writePrivateFile(c.backup,bytes,transactionIdentity,storage.security);c.backupSaved=true;},c.target);}
   stage='prepare-target-directories';for(const d of record.directories){target=d.path;await assertDirectory(d.path,d.beforeIdentity);if(!d.beforeIdentity)await perform(async()=>{await fs.mkdir(d.path);d.afterIdentity=await inspectDirectory(d.path);d.created=true;});}
   stage='write-targets';for(const c of changes){target=c.target;await perform(async()=>{if(c.source){const original=current.sourceSnapshot.files.find(f=>f.relative===c.relative);await assertTarget(c.source,original.identity,c.after);}const bytes=c.source?await fs.readFile(c.source):Buffer.from(c.bytes,'base64');if(hash(bytes)!==c.after)throw new Error('Source bytes changed.');c.afterIdentity=await writeTarget(c,bytes,c.beforeIdentity,c.before);c.written=true;record.completedTargets++;},c.source??null);}
   stage='restore-archive-attributes';target=null;await perform(()=>metadata(changes.filter(c=>c.beforeIdentity).map(c=>({path:c.target,kind:'file',expected:c.beforeSecurity})),'restoreArchive'));
   stage='verify-installed';const after=await snapshots(current);
   for(const c of current.containers)for(const b of [...(c.beforeIdentity?[{path:c.path,identity:c.beforeIdentity,security:c.security}]:[]),c.anchor]){const observed=after.containers.find(x=>x.path===b.path);if(!observed||!sameDirectory(observed.identity,b.identity)||!sameSecurity(observed.security,b.security))throw new Error('Original container/anchor identity or metadata changed: '+b.path);}
   if(!sameTree(after.source,current.sourceSnapshot)||stable(after.configuration)!==stable(current.configuration))throw new Error('Source/configuration changed during installation.');
   for(const f of current.canonicalBefore?.files??[]){const now=after.canonical.files.find(x=>x.relative===f.relative);if(!now||!sameIdentity(now.identity,f.identity)||!sameSecurity(now.security,f.security))throw new Error('Original canonical file identity/metadata changed.');}
   for(const d of current.canonicalBefore?.directories??[]){const now=after.canonical.directories.find(x=>x.relative===d.relative);if(!now||!sameDirectory(now.identity,d.identity)||!sameSecurity(now.security,d.security))throw new Error('Original canonical directory changed.');}
   if(current.instructionsBefore.identity&&(!sameIdentity(after.instructions.identity,current.instructionsBefore.identity)||!sameSecurity(after.instructions.security,current.instructionsBefore.security)))throw new Error('Original instruction identity/metadata changed.');
   const instructionChange=changes.find(c=>c.role==='instructions');
   if(!equalMapping(mapping(after.canonical),mapping(current.sourceSnapshot))||after.instructions.sha256!==(instructionChange?instructionChange.after:current.instructionsBefore.sha256))throw new Error('Installed bytes do not match the reviewed plan.');
   record.canonicalAfter=after.canonical;record.instructionsAfter=after.instructions;record.containersAfter=after.containers;record.planFile=after.planFile;for(const c of changes)if(c.backup)c.backupSnapshot=after.backups.find(b=>b.path===c.backup);
   for(const d of record.directories){const observed=after.canonical.directories.find(x=>path.join(current.targetSkill,x.relative)===d.path);d.afterIdentity=observed.identity;d.afterSecurity=observed.security;}
   stage='installed-manifest';target=manifest;record.status='installed';operationFact(record,'install',stage,target,'confirmed');await persist();return {status:'installed',changedFiles:changes.length,rollbackManifest:manifest,next:`Start a new ${hostProfile(current.host).label} session and use the current skill.`};
  });
 }catch(error){failWithRecovery(error,e=>{const actualStage=e?.journalFailure?'progress-journal':stage,actualTarget=e?.journalFailure?manifest:target;return Object.assign(new Error(`${e?.message??String(e)}. Install ${actualStage}; failed target: ${actualTarget??'preflight'}. Preserve recovery manifest ${manifest}; no automatic rollback.`,{cause:e}),{recovery:{operation:'install',stage:actualStage,failedTarget:actualTarget,completedTargets:record?.completedTargets??0,manifest,backupDirectory:plan.backupDirectory,createdContainers:[...created].map(([p,id])=>({path:p,identity:id})),...(e.journalFailure?{journalFailure:e.journalFailure}:{}),...(e.metadataFacts?{metadataFacts:e.metadataFacts}:{}),...(e.metadataProcess?{metadataProcess:e.metadataProcess}:{})},...(e.metadataRaw!==undefined?{metadataRaw:e.metadataRaw}:{})});});}
}

export async function rollbackInstall(manifest){if(typeof manifest!=='string'||!manifest)throw new Error('A current manifest path is required.');manifest=path.resolve(manifest);const observed=await stableJournal(manifest);const record=assertRecord(parseJsonBytes(observed.bytes),'install-record');if(record.status!=='installed')throw new Error('Only a completed installed transaction may be rolled back.');return rollbackCurrentInstall(manifest,record,observed);}
