"use strict";
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
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
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
exports.SupabaseService = void 0;
var common_1 = require("@nestjs/common");
var supabase_js_1 = require("@supabase/supabase-js");
var supabase_config_1 = require("./supabase.config");
var SupabaseService = function () {
    var _classDecorators = [(0, common_1.Injectable)()];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var SupabaseService = _classThis = /** @class */ (function () {
        function SupabaseService_1(configService) {
            this.configService = configService;
            this.logger = new common_1.Logger(SupabaseService.name);
            var config = (0, supabase_config_1.getSupabaseConfig)(this.configService);
            if (!config.url || !config.key) {
                this.logger.error('Supabase URL and ANON_KEY must be provided');
                throw new Error('Supabase configuration is missing');
            }
            this.supabase = (0, supabase_js_1.createClient)(config.url, config.key, {
                auth: {
                    autoRefreshToken: true,
                    persistSession: false,
                },
            });
            this.logger.log('Supabase client initialized successfully');
        }
        SupabaseService_1.prototype.getClient = function () {
            return this.supabase;
        };
        SupabaseService_1.prototype.signOut = function () {
            return __awaiter(this, void 0, void 0, function () {
                var error;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, this.supabase.auth.signOut()];
                        case 1:
                            error = (_a.sent()).error;
                            if (error) {
                                this.logger.error("Sign out error: ".concat(error.message));
                                throw error;
                            }
                            return [2 /*return*/, { message: 'Successfully signed out' }];
                    }
                });
            });
        };
        SupabaseService_1.prototype.getUser = function (accessToken) {
            return __awaiter(this, void 0, void 0, function () {
                var _a, data, error;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0: return [4 /*yield*/, this.supabase.auth.getUser(accessToken)];
                        case 1:
                            _a = _b.sent(), data = _a.data, error = _a.error;
                            if (error) {
                                this.logger.error("Get user error: ".concat(error.message));
                                throw error;
                            }
                            return [2 /*return*/, data];
                    }
                });
            });
        };
        /**
         * Validate GitHub OAuth token and get user information
         */
        SupabaseService_1.prototype.validateGitHubToken = function (accessToken) {
            return __awaiter(this, void 0, void 0, function () {
                var _a, data, error, isGitHubUser, error_1;
                var _b, _c;
                return __generator(this, function (_d) {
                    switch (_d.label) {
                        case 0:
                            _d.trys.push([0, 2, , 3]);
                            return [4 /*yield*/, this.supabase.auth.getUser(accessToken)];
                        case 1:
                            _a = _d.sent(), data = _a.data, error = _a.error;
                            if (error) {
                                this.logger.error("GitHub token validation error: ".concat(error.message));
                                throw error;
                            }
                            if (!data.user) {
                                throw new Error('User not found');
                            }
                            isGitHubUser = ((_b = data.user.app_metadata) === null || _b === void 0 ? void 0 : _b.provider) === 'github';
                            this.logger.debug('GitHub token validated', {
                                userId: data.user.id,
                                provider: (_c = data.user.app_metadata) === null || _c === void 0 ? void 0 : _c.provider,
                                isGitHubUser: isGitHubUser,
                            });
                            return [2 /*return*/, { user: data.user, isGitHubUser: isGitHubUser }];
                        case 2:
                            error_1 = _d.sent();
                            this.logger.error('Failed to validate GitHub token', error_1);
                            throw error_1;
                        case 3: return [2 /*return*/];
                    }
                });
            });
        };
        /**
         * Extract GitHub user profile information from Supabase user
         */
        SupabaseService_1.prototype.extractGitHubProfile = function (user) {
            var _a;
            if (!user || ((_a = user.app_metadata) === null || _a === void 0 ? void 0 : _a.provider) !== 'github') {
                return null;
            }
            var userMetadata = user.user_metadata || {};
            return {
                id: user.id,
                email: user.email || '',
                provider: 'github',
                github_username: userMetadata.user_name || userMetadata.preferred_username,
                avatar_url: userMetadata.avatar_url,
                full_name: userMetadata.full_name || userMetadata.name,
                created_at: user.created_at,
                last_sign_in_at: user.last_sign_in_at || user.created_at,
            };
        };
        /**
         * Refresh access token using refresh token
         */
        SupabaseService_1.prototype.refreshToken = function (refreshToken) {
            return __awaiter(this, void 0, void 0, function () {
                var _a, data, error, error_2;
                var _b;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            _c.trys.push([0, 2, , 3]);
                            return [4 /*yield*/, this.supabase.auth.refreshSession({
                                    refresh_token: refreshToken,
                                })];
                        case 1:
                            _a = _c.sent(), data = _a.data, error = _a.error;
                            if (error) {
                                this.logger.error("Token refresh error: ".concat(error.message));
                                throw error;
                            }
                            this.logger.debug('Token refreshed successfully', {
                                userId: (_b = data.user) === null || _b === void 0 ? void 0 : _b.id,
                            });
                            return [2 /*return*/, data];
                        case 2:
                            error_2 = _c.sent();
                            this.logger.error('Failed to refresh token', error_2);
                            throw error_2;
                        case 3: return [2 /*return*/];
                    }
                });
            });
        };
        /**
         * Get current session information
         */
        SupabaseService_1.prototype.getSession = function (accessToken) {
            return __awaiter(this, void 0, void 0, function () {
                var _a, data, error, error_3;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            _b.trys.push([0, 2, , 3]);
                            return [4 /*yield*/, this.supabase.auth.getUser(accessToken)];
                        case 1:
                            _a = _b.sent(), data = _a.data, error = _a.error;
                            if (error) {
                                this.logger.error("Get session error: ".concat(error.message));
                                throw error;
                            }
                            return [2 /*return*/, {
                                    user: data.user,
                                    access_token: accessToken,
                                    token_type: 'bearer',
                                }];
                        case 2:
                            error_3 = _b.sent();
                            this.logger.error('Failed to get session', error_3);
                            throw error_3;
                        case 3: return [2 /*return*/];
                    }
                });
            });
        };
        /**
         * Verify if user has GitHub provider
         */
        SupabaseService_1.prototype.isGitHubUser = function (user) {
            var _a;
            return ((_a = user === null || user === void 0 ? void 0 : user.app_metadata) === null || _a === void 0 ? void 0 : _a.provider) === 'github';
        };
        return SupabaseService_1;
    }());
    __setFunctionName(_classThis, "SupabaseService");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        SupabaseService = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return SupabaseService = _classThis;
}();
exports.SupabaseService = SupabaseService;
