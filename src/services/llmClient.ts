import { LLMChangeProposal, LLMStatus } from '../types';
import { executeLocalModelProposal, MODEL_ID } from './llm.worker';

export interface LLMInvocationLog {
  modelIdentifier: string;
  runtime: string;
  requestId: string;
  timestamp: string;
  prompt: string;
  rawModelOutput?: string;
  executionResult: string;
  errorStatus?: string;
  source: 'local-model' | 'deterministic-fallback';
}

type StatusListener = (status: LLMStatus) => void;

export class LLMClient {
  private worker: Worker | null = null;
  private currentStatus: LLMStatus = {
    state: 'idle',
    statusMessage: 'Local model ready to load on-device. Zero API keys required.',
    modelName: MODEL_ID,
    device: 'WebAssembly (On-Device)'
  };
  private listeners: Set<StatusListener> = new Set();
  private pendingTasks: Map<
    string,
    {
      resolve: (res: LLMChangeProposal) => void;
      reject: (err: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  > = new Map();
  private executionLogs: LLMInvocationLog[] = [];
  private testWorkerRunner?: (userPrompt: string) => Promise<LLMChangeProposal>;
  private requestTimeoutMs = 30000;
  private forceUnavailable = false;

  constructor() {
    this.initWorker();
  }

  private initWorker() {
    if (typeof Worker === 'undefined') {
      // In Node/non-Worker environments, on-device ONNX runtime executes via executeLocalModelProposal
      this.updateStatus({
        state: 'ready',
        statusMessage: 'Local ONNX model runtime ready (Direct Execution).',
        device: 'WebAssembly (On-Device)'
      });
      return;
    }

    try {
      this.worker = new Worker(new URL('./llm.worker.ts', import.meta.url), {
        type: 'module'
      });

      this.worker.onmessage = (e: MessageEvent) => {
        const { type, id, status, progress, modelName, error, proposal } = e.data;

        if (type === 'STATUS') {
          this.updateStatus({
            state: status,
            statusMessage:
              status === 'ready'
                ? 'Model loaded and operational offline.'
                : 'Downloading local model weights (~60MB once)...',
            modelName: modelName || this.currentStatus.modelName
          });
        } else if (type === 'PROGRESS') {
          this.updateStatus({
            state: 'downloading',
            progress: progress,
            statusMessage: `Downloading model weights: ${progress}%`
          });
        } else if (type === 'ERROR') {
          this.updateStatus({
            state: 'error',
            statusMessage: error
          });
        } else if (type === 'TASK_SUCCESS') {
          const task = this.pendingTasks.get(id);
          if (task) {
            clearTimeout(task.timer);
            this.pendingTasks.delete(id);
            this.updateStatus({ state: 'ready', statusMessage: 'Ready' });
            task.resolve(proposal);
          }
        } else if (type === 'TASK_ERROR') {
          const task = this.pendingTasks.get(id);
          if (task) {
            clearTimeout(task.timer);
            this.pendingTasks.delete(id);
            this.updateStatus({ state: 'ready', statusMessage: 'Ready' });
            task.reject(new Error(error));
          }
        }
      };

      this.worker.onerror = (err) => {
        this.updateStatus({
          state: 'error',
          statusMessage: `Worker runtime failure: ${err.message || 'Worker thread crashed.'}`
        });
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.updateStatus({
        state: 'error',
        statusMessage: `Worker instantiation failed: ${errorMsg}`
      });
    }
  }

  private updateStatus(newStatus: Partial<LLMStatus>) {
    this.currentStatus = { ...this.currentStatus, ...newStatus };
    for (const listener of this.listeners) {
      listener(this.currentStatus);
    }
  }

  public subscribeStatus(listener: StatusListener): () => void {
    this.listeners.add(listener);
    listener(this.currentStatus);
    return () => this.listeners.delete(listener);
  }

  public initializeModel(): void {
    if (!this.worker) return;
    if (this.currentStatus.state === 'ready') return;
    this.updateStatus({ state: 'downloading', statusMessage: 'Downloading model weights (~60MB once)...', progress: 0 });
    this.worker.postMessage({ type: 'INIT_MODEL' });
  }

  public setTestRunner(runner?: (userPrompt: string) => Promise<LLMChangeProposal>): void {
    this.testWorkerRunner = runner;
  }

  public setRequestTimeoutMs(timeoutMs: number): void {
    this.requestTimeoutMs = Math.max(1, timeoutMs);
  }

  public setModelUnavailable(unavailable: boolean): void {
    this.forceUnavailable = unavailable;
    if (unavailable) {
      this.updateStatus({
        state: 'error',
        statusMessage: 'Local model is unavailable.'
      });
    } else {
      this.updateStatus({
        state: 'ready',
        statusMessage: 'Ready'
      });
    }
  }

  public getExecutionLogs(): LLMInvocationLog[] {
    return [...this.executionLogs];
  }

  public clearExecutionLogs(): void {
    this.executionLogs = [];
  }

  public getStatus(): LLMStatus {
    return { ...this.currentStatus };
  }

  public async requestProposal(userPrompt: string): Promise<LLMChangeProposal> {
    if (!userPrompt || userPrompt.trim().length === 0) {
      throw new Error('Please enter a description or prompt for Invoice Buddy.');
    }

    if (userPrompt.length > 500) {
      throw new Error('Prompt exceeds maximum allowable length of 500 characters.');
    }

    const taskId = 'task_' + Math.random().toString(36).substring(2, 9);
    const timestamp = new Date().toISOString();

    if (this.forceUnavailable) {
      const unavailErr = new Error('Local model is unavailable or failed to initialize.');
      this.executionLogs.push({
        modelIdentifier: this.currentStatus.modelName,
        runtime: this.currentStatus.device,
        requestId: taskId,
        timestamp,
        prompt: userPrompt,
        executionResult: 'UNAVAILABLE',
        errorStatus: unavailErr.message,
        source: 'deterministic-fallback'
      });
      throw unavailErr;
    }

    // If a test worker runner is set
    if (this.testWorkerRunner) {
      const runner = this.testWorkerRunner;
      return new Promise<LLMChangeProposal>((resolve, reject) => {
        const timer = setTimeout(() => {
          const timeoutErr = new Error(
            `Invoice Buddy timed out while generating response (exceeded ${this.requestTimeoutMs}ms execution limit).`
          );
          this.executionLogs.push({
            modelIdentifier: this.currentStatus.modelName,
            runtime: this.currentStatus.device,
            requestId: taskId,
            timestamp,
            prompt: userPrompt,
            executionResult: 'TIMEOUT',
            errorStatus: timeoutErr.message,
            source: 'deterministic-fallback'
          });
          reject(timeoutErr);
        }, this.requestTimeoutMs);

        runner(userPrompt)
          .then((res) => {
            clearTimeout(timer);
            const rawOutput = res.rawModelOutput !== undefined ? res.rawModelOutput : res.summary;
            this.executionLogs.push({
              modelIdentifier: res.modelIdentifier || this.currentStatus.modelName,
              runtime: res.runtime || this.currentStatus.device,
              requestId: res.requestId || taskId,
              timestamp,
              prompt: userPrompt,
              rawModelOutput: rawOutput,
              executionResult: res.summary,
              source: 'local-model'
            });
            resolve({
              ...res,
              requestId: res.requestId || taskId,
              modelIdentifier: res.modelIdentifier || this.currentStatus.modelName,
              runtime: res.runtime || this.currentStatus.device,
              rawModelOutput: rawOutput,
              provenance: 'local-model'
            });
          })
          .catch((err: unknown) => {
            clearTimeout(timer);
            const errMsg = err instanceof Error ? err.message : String(err);
            this.executionLogs.push({
              modelIdentifier: this.currentStatus.modelName,
              runtime: this.currentStatus.device,
              requestId: taskId,
              timestamp,
              prompt: userPrompt,
              executionResult: 'FAILED',
              errorStatus: errMsg,
              source: 'deterministic-fallback'
            });
            reject(err instanceof Error ? err : new Error(errMsg));
          });
      });
    }

    // Direct execution path when running outside browser WebWorker (e.g., Node/Vitest ONNX runtime)
    if (!this.worker) {
      return new Promise<LLMChangeProposal>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.updateStatus({ state: 'ready', statusMessage: 'Task timed out.' });
          const timeoutErr = new Error(
            `Invoice Buddy timed out while generating response (exceeded ${this.requestTimeoutMs}ms execution limit).`
          );
          this.executionLogs.push({
            modelIdentifier: this.currentStatus.modelName,
            runtime: this.currentStatus.device,
            requestId: taskId,
            timestamp,
            prompt: userPrompt,
            executionResult: 'TIMEOUT',
            errorStatus: timeoutErr.message,
            source: 'deterministic-fallback'
          });
          reject(timeoutErr);
        }, this.requestTimeoutMs);

        this.updateStatus({
          state: 'processing',
          statusMessage: 'Invoice Buddy is processing on-device...'
        });

        executeLocalModelProposal(userPrompt, taskId)
          .then((prop) => {
            clearTimeout(timer);
            this.updateStatus({ state: 'ready', statusMessage: 'Ready' });
            this.executionLogs.push({
              modelIdentifier: prop.modelIdentifier || this.currentStatus.modelName,
              runtime: prop.runtime || this.currentStatus.device,
              requestId: prop.requestId || taskId,
              timestamp,
              prompt: userPrompt,
              rawModelOutput: prop.rawModelOutput,
              executionResult: prop.summary,
              source: 'local-model'
            });
            resolve({
              ...prop,
              requestId: prop.requestId || taskId,
              modelIdentifier: prop.modelIdentifier || this.currentStatus.modelName,
              runtime: prop.runtime || this.currentStatus.device,
              provenance: 'local-model'
            });
          })
          .catch((err: unknown) => {
            clearTimeout(timer);
            this.updateStatus({ state: 'ready', statusMessage: 'Ready' });
            const errMsg = err instanceof Error ? err.message : String(err);
            this.executionLogs.push({
              modelIdentifier: this.currentStatus.modelName,
              runtime: this.currentStatus.device,
              requestId: taskId,
              timestamp,
              prompt: userPrompt,
              executionResult: 'FAILED',
              errorStatus: errMsg,
              source: 'deterministic-fallback'
            });
            reject(err instanceof Error ? err : new Error(errMsg));
          });
      });
    }

    return new Promise<LLMChangeProposal>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingTasks.delete(taskId);
        this.updateStatus({ state: 'ready', statusMessage: 'Task timed out.' });
        const timeoutErr = new Error(
          `Invoice Buddy timed out while generating response (exceeded ${this.requestTimeoutMs}ms execution limit).`
        );
        this.executionLogs.push({
          modelIdentifier: this.currentStatus.modelName,
          runtime: this.currentStatus.device,
          requestId: taskId,
          timestamp,
          prompt: userPrompt,
          executionResult: 'TIMEOUT',
          errorStatus: timeoutErr.message,
          source: 'deterministic-fallback'
        });
        reject(timeoutErr);
      }, this.requestTimeoutMs);

      this.pendingTasks.set(taskId, {
        resolve: (prop) => {
          this.executionLogs.push({
            modelIdentifier: prop.modelIdentifier || this.currentStatus.modelName,
            runtime: prop.runtime || this.currentStatus.device,
            requestId: prop.requestId || taskId,
            timestamp,
            prompt: userPrompt,
            rawModelOutput: prop.rawModelOutput,
            executionResult: prop.summary,
            source: 'local-model'
          });
          resolve({
            ...prop,
            requestId: prop.requestId || taskId,
            modelIdentifier: prop.modelIdentifier || this.currentStatus.modelName,
            runtime: prop.runtime || this.currentStatus.device,
            provenance: 'local-model'
          });
        },
        reject: (err) => {
          this.executionLogs.push({
            modelIdentifier: this.currentStatus.modelName,
            runtime: this.currentStatus.device,
            requestId: taskId,
            timestamp,
            prompt: userPrompt,
            executionResult: 'FAILED',
            errorStatus: err.message,
            source: 'deterministic-fallback'
          });
          reject(err);
        },
        timer
      });

      this.updateStatus({
        state: 'processing',
        statusMessage: 'Invoice Buddy is processing on-device...'
      });

      this.worker?.postMessage({
        type: 'RUN_INVOICE_BUDDY',
        id: taskId,
        payload: { userPrompt }
      });
    });
  }
}

export const llmClient = new LLMClient();

