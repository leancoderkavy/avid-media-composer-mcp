import {expect,it} from 'vitest';
import {nativeRpcRejection} from '../src/native/client.js';
import {errorDetails} from '../src/errors.js';

it('preserves the observed native rejection code through MCP error serialization',()=>{
 const error=nativeRpcRejection({':status':200,'grpc-status':'2','grpc-message':encodeURIComponent(JSON.stringify({ErrorMessage:'Column is not modifiable.',ErrorType:55,unknown:'PRIVATE'}))});
 expect(errorDetails(error)).toMatchObject({code:'NATIVE_RPC_REJECTED',details:{httpStatus:200,grpcStatus:'2',nativeErrorType:55,operationOutcome:'not_verified',nextStep:'inspect_state_before_retrying_write'}});
 expect(error.message).toContain('Column is not modifiable.');expect(error.message).toContain('Inspect state');
 expect(JSON.stringify(errorDetails(error))).not.toContain('PRIVATE');
 expect(error.details).not.toHaveProperty('retryable');
});
it('bounds encoded messages, statuses and malformed diagnostics',()=>{
 const error=nativeRpcRejection({':status':503,'grpc-status':'x'.repeat(5000),'grpc-message':'%'.repeat(10000)});
 expect(error.message.length).toBeLessThan(1200);expect(error.details?.grpcStatus).toHaveLength(32);
 expect(error.details).not.toHaveProperty('nativeErrorType');
 expect(nativeRpcRejection({}).details).toMatchObject({httpStatus:null,grpcStatus:null,operationOutcome:'not_verified'});
});
it.each([{ErrorType:'55',private:'PRIVATE'},['PRIVATE'],null,42])('does not coerce or disclose unsupported structured fields: %j',diagnostic=>{
 const error=nativeRpcRejection({'grpc-message':JSON.stringify(diagnostic)});
 expect(error.details).not.toHaveProperty('nativeErrorType');expect(error.message).not.toContain('PRIVATE');
});
it('retains plain text and decodes Unicode once',()=>{
 expect(nativeRpcRejection({'grpc-message':encodeURIComponent('Café unavailable')}).message).toContain('Café unavailable');
 expect(nativeRpcRejection({'grpc-message':'Busy'}).message).toContain('Busy');
});
