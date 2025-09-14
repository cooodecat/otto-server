"use strict";
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
var common_1 = require("@nestjs/common");
var supabase_auth_guard_1 = require("../supabase/guards/supabase-auth.guard");
var AuthController = function () {
    var _classDecorators = [(0, common_1.Controller)('auth')];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var _instanceExtraInitializers = [];
    var _signOut_decorators;
    var _getProfile_decorators;
    var _getGitHubProfile_decorators;
    var _refreshToken_decorators;
    var _getSession_decorators;
    var AuthController = _classThis = /** @class */ (function () {
        function AuthController_1(supabaseService) {
            this.supabaseService = (__runInitializers(this, _instanceExtraInitializers), supabaseService);
            this.logger = new common_1.Logger(AuthController.name);
        }
        AuthController_1.prototype.signOut = function () {
            return __awaiter(this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    return [2 /*return*/, this.supabaseService.signOut()];
                });
            });
        };
        AuthController_1.prototype.getProfile = function (req) {
            try {
                return {
                    success: true,
                    data: {
                        message: 'Successfully accessed protected route',
                        user: req.user,
                    },
                };
            }
            catch (error) {
                this.logger.error('Get profile error', error);
                throw new common_1.HttpException({
                    success: false,
                    error: {
                        code: 'PROFILE_ERROR',
                        message: 'Failed to get user profile',
                    },
                }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
            }
        };
        AuthController_1.prototype.getGitHubProfile = function (req) {
            return __awaiter(this, void 0, void 0, function () {
                var authHeader, token, user, githubProfile, error_1;
                var _a;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            _b.trys.push([0, 3, , 4]);
                            if (req.user.provider !== 'github') {
                                throw new common_1.HttpException({
                                    success: false,
                                    error: {
                                        code: 'NOT_GITHUB_USER',
                                        message: 'User is not authenticated via GitHub',
                                    },
                                }, common_1.HttpStatus.BAD_REQUEST);
                            }
                            authHeader = (_a = req.headers) === null || _a === void 0 ? void 0 : _a['authorization'];
                            token = authHeader === null || authHeader === void 0 ? void 0 : authHeader.replace('Bearer ', '');
                            if (!token) return [3 /*break*/, 2];
                            return [4 /*yield*/, this.supabaseService.validateGitHubToken(token)];
                        case 1:
                            user = (_b.sent()).user;
                            githubProfile = this.supabaseService.extractGitHubProfile(user);
                            return [2 /*return*/, {
                                    success: true,
                                    data: githubProfile,
                                }];
                        case 2: return [2 /*return*/, {
                                success: true,
                                data: {
                                    id: req.user.id,
                                    email: req.user.email,
                                    provider: req.user.provider,
                                    github_username: req.user.githubUsername,
                                    avatar_url: req.user.avatarUrl,
                                    full_name: req.user.fullName,
                                },
                            }];
                        case 3:
                            error_1 = _b.sent();
                            this.logger.error('Get GitHub profile error', error_1);
                            if (error_1 instanceof common_1.HttpException) {
                                throw error_1;
                            }
                            throw new common_1.HttpException({
                                success: false,
                                error: {
                                    code: 'GITHUB_PROFILE_ERROR',
                                    message: 'Failed to get GitHub profile',
                                },
                            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
                        case 4: return [2 /*return*/];
                    }
                });
            });
        };
        AuthController_1.prototype.refreshToken = function (refreshTokenDto) {
            return __awaiter(this, void 0, void 0, function () {
                var refresh_token, result, error_2;
                var _a, _b, _c;
                return __generator(this, function (_d) {
                    switch (_d.label) {
                        case 0:
                            _d.trys.push([0, 2, , 3]);
                            refresh_token = refreshTokenDto.refresh_token;
                            if (!refresh_token) {
                                throw new common_1.HttpException({
                                    success: false,
                                    error: {
                                        code: 'MISSING_REFRESH_TOKEN',
                                        message: 'Refresh token is required',
                                    },
                                }, common_1.HttpStatus.BAD_REQUEST);
                            }
                            return [4 /*yield*/, this.supabaseService.refreshToken(refresh_token)];
                        case 1:
                            result = _d.sent();
                            return [2 /*return*/, {
                                    success: true,
                                    data: {
                                        access_token: (_a = result.session) === null || _a === void 0 ? void 0 : _a.access_token,
                                        refresh_token: (_b = result.session) === null || _b === void 0 ? void 0 : _b.refresh_token,
                                        expires_in: (_c = result.session) === null || _c === void 0 ? void 0 : _c.expires_in,
                                        user: result.user,
                                    },
                                }];
                        case 2:
                            error_2 = _d.sent();
                            this.logger.error('Refresh token error', error_2);
                            throw new common_1.HttpException({
                                success: false,
                                error: {
                                    code: 'REFRESH_TOKEN_ERROR',
                                    message: 'Failed to refresh token',
                                },
                            }, common_1.HttpStatus.UNAUTHORIZED);
                        case 3: return [2 /*return*/];
                    }
                });
            });
        };
        AuthController_1.prototype.getSession = function (req) {
            return __awaiter(this, void 0, void 0, function () {
                var authHeader, token, error_3;
                var _a;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            _b.trys.push([0, 2, , 3]);
                            authHeader = (_a = req.headers) === null || _a === void 0 ? void 0 : _a['authorization'];
                            token = authHeader === null || authHeader === void 0 ? void 0 : authHeader.replace('Bearer ', '');
                            if (!token) {
                                throw new common_1.HttpException({
                                    success: false,
                                    error: {
                                        code: 'MISSING_TOKEN',
                                        message: 'Authorization token is required',
                                    },
                                }, common_1.HttpStatus.UNAUTHORIZED);
                            }
                            return [4 /*yield*/, this.supabaseService.getSession(token)];
                        case 1:
                            _b.sent();
                            return [2 /*return*/, {
                                    success: true,
                                    data: {
                                        user: req.user,
                                        session: {
                                            access_token: token,
                                            token_type: 'bearer',
                                            expires_at: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
                                        },
                                    },
                                }];
                        case 2:
                            error_3 = _b.sent();
                            this.logger.error('Get session error', error_3);
                            throw new common_1.HttpException({
                                success: false,
                                error: {
                                    code: 'SESSION_ERROR',
                                    message: 'Failed to get session',
                                },
                            }, common_1.HttpStatus.INTERNAL_SERVER_ERROR);
                        case 3: return [2 /*return*/];
                    }
                });
            });
        };
        return AuthController_1;
    }());
    __setFunctionName(_classThis, "AuthController");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _signOut_decorators = [(0, common_1.Post)('signout'), (0, common_1.UseGuards)(supabase_auth_guard_1.SupabaseAuthGuard)];
        _getProfile_decorators = [(0, common_1.Get)('profile'), (0, common_1.UseGuards)(supabase_auth_guard_1.SupabaseAuthGuard)];
        _getGitHubProfile_decorators = [(0, common_1.Get)('github/profile'), (0, common_1.UseGuards)(supabase_auth_guard_1.SupabaseAuthGuard)];
        _refreshToken_decorators = [(0, common_1.Post)('refresh')];
        _getSession_decorators = [(0, common_1.Get)('session'), (0, common_1.UseGuards)(supabase_auth_guard_1.SupabaseAuthGuard)];
        __esDecorate(_classThis, null, _signOut_decorators, { kind: "method", name: "signOut", static: false, private: false, access: { has: function (obj) { return "signOut" in obj; }, get: function (obj) { return obj.signOut; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getProfile_decorators, { kind: "method", name: "getProfile", static: false, private: false, access: { has: function (obj) { return "getProfile" in obj; }, get: function (obj) { return obj.getProfile; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getGitHubProfile_decorators, { kind: "method", name: "getGitHubProfile", static: false, private: false, access: { has: function (obj) { return "getGitHubProfile" in obj; }, get: function (obj) { return obj.getGitHubProfile; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _refreshToken_decorators, { kind: "method", name: "refreshToken", static: false, private: false, access: { has: function (obj) { return "refreshToken" in obj; }, get: function (obj) { return obj.refreshToken; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getSession_decorators, { kind: "method", name: "getSession", static: false, private: false, access: { has: function (obj) { return "getSession" in obj; }, get: function (obj) { return obj.getSession; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        AuthController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return AuthController = _classThis;
}();
exports.AuthController = AuthController;
