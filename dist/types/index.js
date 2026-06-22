export class ClaudeSyncError extends Error {
    code;
    suggestion;
    constructor(message, code, suggestion) {
        super(message);
        this.code = code;
        this.suggestion = suggestion;
        this.name = 'ClaudeSyncError';
    }
}
export var ErrorCode;
(function (ErrorCode) {
    ErrorCode["NOT_INITIALIZED"] = "NOT_INITIALIZED";
    ErrorCode["NOT_GIT_REPO"] = "NOT_GIT_REPO";
    ErrorCode["NO_REMOTE"] = "NO_REMOTE";
    ErrorCode["MERGE_CONFLICT"] = "MERGE_CONFLICT";
    ErrorCode["PERMISSION_DENIED"] = "PERMISSION_DENIED";
    ErrorCode["NETWORK_ERROR"] = "NETWORK_ERROR";
    ErrorCode["INVALID_CONFIG"] = "INVALID_CONFIG";
    ErrorCode["UNSUPPORTED_PLATFORM"] = "UNSUPPORTED_PLATFORM";
    ErrorCode["ALREADY_EXISTS"] = "ALREADY_EXISTS";
    ErrorCode["CLONE_FAILED"] = "CLONE_FAILED";
})(ErrorCode || (ErrorCode = {}));
//# sourceMappingURL=index.js.map