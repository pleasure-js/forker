## Classes

<dl>
<dt><a href="#RunningProcess">RunningProcess</a></dt>
<dd><p>Holds the information of a running process</p>
</dd>
<dt><a href="#DaemonizerServer">DaemonizerServer</a></dt>
<dd></dd>
<dt><a href="#Daemonizer">Daemonizer</a></dt>
<dd></dd>
</dl>

## Typedefs

<dl>
<dt><a href="#RunningProcessOptions">RunningProcessOptions</a> : <code>Object</code></dt>
<dd><p>Spawn arguments</p>
</dd>
<dt><a href="#SpawnArgs">SpawnArgs</a> : <code>Object</code></dt>
<dd><p>Spawn arguments</p>
</dd>
<dt><a href="#ENV">ENV</a> : <code>Object</code></dt>
<dd><p>Environmental variables</p>
</dd>
<dt><a href="#DaemonizerConfig">DaemonizerConfig</a> : <code>Object</code></dt>
<dd></dd>
</dl>

<a name="RunningProcess"></a>

## RunningProcess
Holds the information of a running process

**Kind**: global class  

* [RunningProcess](#RunningProcess)
    * [new RunningProcess(id, spawnArgs, options)](#new_RunningProcess_new)
    * [.start()](#RunningProcess+start)
    * [.restart()](#RunningProcess+restart)
    * [.stop()](#RunningProcess+stop)

<a name="new_RunningProcess_new"></a>

### new RunningProcess(id, spawnArgs, options)

| Param | Type | Description |
| --- | --- | --- |
| id | <code>String</code> | The command to run. |
| spawnArgs | [<code>SpawnArgs</code>](#SpawnArgs) | Spawn arguments |
| options | [<code>RunningProcessOptions</code>](#RunningProcessOptions) | Configuration options |

<a name="RunningProcess+start"></a>

### runningProcess.start()
Runs the program

**Kind**: instance method of [<code>RunningProcess</code>](#RunningProcess)  
<a name="RunningProcess+restart"></a>

### runningProcess.restart()
Re-starts the program

**Kind**: instance method of [<code>RunningProcess</code>](#RunningProcess)  
<a name="RunningProcess+stop"></a>

### runningProcess.stop()
Re-starts the program

**Kind**: instance method of [<code>RunningProcess</code>](#RunningProcess)  
<a name="DaemonizerServer"></a>

## DaemonizerServer
**Kind**: global class  
**Classdec**: DaemonizerDaemon is the process manager that creates and control multiple spawned processes to monitor.  

* [DaemonizerServer](#DaemonizerServer)
    * _instance_
        * [.findProcessById(id)](#DaemonizerServer+findProcessById) ⇒ [<code>RunningProcess</code>](#RunningProcess) \| <code>void</code>
        * [.findProcessByPid(pid)](#DaemonizerServer+findProcessByPid) ⇒ [<code>RunningProcess</code>](#RunningProcess) \| <code>void</code>
        * [.fork(id, spawnArgs, processOptions)](#DaemonizerServer+fork)
        * [.stop(id)](#DaemonizerServer+stop)
    * _static_
        * [.isRunning([config])](#DaemonizerServer.isRunning) ⇒ <code>Number</code> \| <code>void</code>
        * [.start(config, env)](#DaemonizerServer.start) ⇒ <code>Number</code>

<a name="DaemonizerServer+findProcessById"></a>

### daemonizerServer.findProcessById(id) ⇒ [<code>RunningProcess</code>](#RunningProcess) \| <code>void</code>
Returns a [RunningProcess](#RunningProcess) given an `id`.

**Kind**: instance method of [<code>DaemonizerServer</code>](#DaemonizerServer)  
**Returns**: [<code>RunningProcess</code>](#RunningProcess) \| <code>void</code> - The running process  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>String</code> | SubProcess id (different than pid) |

<a name="DaemonizerServer+findProcessByPid"></a>

### daemonizerServer.findProcessByPid(pid) ⇒ [<code>RunningProcess</code>](#RunningProcess) \| <code>void</code>
Returns a [RunningProcess](#RunningProcess) given an `id`.

**Kind**: instance method of [<code>DaemonizerServer</code>](#DaemonizerServer)  
**Returns**: [<code>RunningProcess</code>](#RunningProcess) \| <code>void</code> - The running process  

| Param | Type | Description |
| --- | --- | --- |
| pid | <code>String</code> | Process id |

<a name="DaemonizerServer+fork"></a>

### daemonizerServer.fork(id, spawnArgs, processOptions)
Forks a process & starts monitoring it

**Kind**: instance method of [<code>DaemonizerServer</code>](#DaemonizerServer)  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>String</code> | Optional identifier for the process. If none if provided, the system will automatically try to guess one. |
| spawnArgs | [<code>SpawnArgs</code>](#SpawnArgs) |  |
| processOptions | [<code>RunningProcessOptions</code>](#RunningProcessOptions) |  |

<a name="DaemonizerServer+stop"></a>

### daemonizerServer.stop(id)
**Kind**: instance method of [<code>DaemonizerServer</code>](#DaemonizerServer)  

| Param | Type |
| --- | --- |
| id | <code>String</code> | 

<a name="DaemonizerServer.isRunning"></a>

### DaemonizerServer.isRunning([config]) ⇒ <code>Number</code> \| <code>void</code>
**Kind**: static method of [<code>DaemonizerServer</code>](#DaemonizerServer)  
**Returns**: <code>Number</code> \| <code>void</code> - Returns the process id (pid) when the process is running. `void` otherwise.  

| Param | Type | Description |
| --- | --- | --- |
| [config] | [<code>DaemonizerConfig</code>](#DaemonizerConfig) | Defaults to default config. |

<a name="DaemonizerServer.start"></a>

### DaemonizerServer.start(config, env) ⇒ <code>Number</code>
**Kind**: static method of [<code>DaemonizerServer</code>](#DaemonizerServer)  
**Returns**: <code>Number</code> - The process id (pid).  
**Throws**:

- <code>Error</code> Throws 'Another process is already running (pid = ${ runningPid })' when a process is already
running.


| Param | Type | Description |
| --- | --- | --- |
| config | [<code>DaemonizerConfig</code>](#DaemonizerConfig) | Defaults to default config. |
| env | <code>Object</code> | Environment key-value pairs. |

<a name="Daemonizer"></a>

## Daemonizer
**Kind**: global class  
**Classdec**: Daemonizer is a process manager that creates an instance to control multiple spawned processes to monitor.  
<a name="Daemonizer+fork"></a>

### daemonizer.fork(id, spawnArgs, processOptions)
Daemonizes a terminal application by sending the request to the running DaemonizerDaemon.

**Kind**: instance method of [<code>Daemonizer</code>](#Daemonizer)  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>String</code> | The command to run. |
| spawnArgs | [<code>SpawnArgs</code>](#SpawnArgs) | List of string arguments. |
| processOptions | [<code>RunningProcessOptions</code>](#RunningProcessOptions) | List of string arguments. |

<a name="RunningProcessOptions"></a>

## RunningProcessOptions : <code>Object</code>
Spawn arguments

**Kind**: global typedef  
**See**: [child_process.spawn](https://nodejs.org/api/child_process.html#child_process_child_process_spawn_command_args_options)  
**Properties**

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| [options.autoRestart] | <code>Boolean</code> | <code>true</code> | Whether to automatically restart the application after failure. |
| [options.waitBeforeRestart] | <code>Number</code> | <code>1000</code> | Milliseconds to wait before triggering `autoRestart`. |
| [options.maximumAutoRestart] | <code>Number</code> | <code>100</code> | Maximum amount of time the process can be autorestarted. Negative for infinite. |

<a name="SpawnArgs"></a>

## SpawnArgs : <code>Object</code>
Spawn arguments

**Kind**: global typedef  
**See**: [child_process.spawn](https://nodejs.org/api/child_process.html#child_process_child_process_spawn_command_args_options)  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| command | <code>String</code> | The command to run. |
| args | <code>Array</code> | List of string arguments. |
| options | <code>Object</code> | `child_process.spawn` options. |

<a name="ENV"></a>

## ENV : <code>Object</code>
Environmental variables

**Kind**: global typedef  
**Properties**

| Name | Type | Description |
| --- | --- | --- |
| [DAEMONIZER_CONFIG] | <code>String</code> | JSON stringified string with default [DaemonizerConfig](#DaemonizerConfig) configuration options. |
| [DAEMONIZER_DAEMON_START] | <code>Boolean</code> | When `true`, triggers automatically [start](#DaemonizerServer.start) |

<a name="DaemonizerConfig"></a>

## DaemonizerConfig : <code>Object</code>
**Kind**: global typedef  
**Properties**

| Name | Type | Default | Description |
| --- | --- | --- | --- |
| [runningThread] | <code>String</code> | <code>../.running</code> | Path to file for storing information about the running thread. |
| port | <code>Number</code> |  | Port where socket.io will listen for connections. |
| ip | <code>String</code> |  | IP address where socket.io will bind. |


* * *

&copy; 2019 Martin Rafael <tin@devtin.io>
