"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
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
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupabaseJwtStrategy = void 0;
var common_1 = require("@nestjs/common");
var passport_1 = require("@nestjs/passport");
var passport_jwt_1 = require("passport-jwt");
var supabase_config_1 = require("../supabase.config");
var SupabaseJwtStrategy = function () {
    var _classDecorators = [(0, common_1.Injectable)()];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var _classSuper = (0, passport_1.PassportStrategy)(passport_jwt_1.Strategy, 'supabase-jwt');
    var SupabaseJwtStrategy = _classThis = /** @class */ (function (_super) {
        __extends(SupabaseJwtStrategy_1, _super);
        function SupabaseJwtStrategy_1(configService, supabaseService) {
            var _this = this;
            var config = (0, supabase_config_1.getSupabaseConfig)(configService);
            _this = _super.call(this, {
                jwtFromRequest: passport_jwt_1.ExtractJwt.fromAuthHeaderAsBearerToken(),
                ignoreExpiration: false,
                secretOrKey: config.jwtSecret,
                algorithms: ['HS256'],
            }) || this;
            _this.configService = configService;
            _this.supabaseService = supabaseService;
            _this.logger = new common_1.Logger(SupabaseJwtStrategy.name);
            return _this;
        }
        SupabaseJwtStrategy_1.prototype.validate = function (payload) {
            var _a;
            this.logger.debug('Validating JWT payload', {
                sub: payload.sub,
                role: payload.role,
            });
            if (!payload.sub || !payload.email) {
                throw new common_1.UnauthorizedException('Invalid token payload');
            }
            // Check if token is expired
            var currentTime = Math.floor(Date.now() / 1000);
            if (payload.exp && payload.exp < currentTime) {
                throw new common_1.UnauthorizedException('Token expired');
            }
            try {
                // Extract provider information
                var provider = ((_a = payload.app_metadata) === null || _a === void 0 ? void 0 : _a.provider) || 'email';
                var isGitHubAuth = provider === 'github';
                // Extract user metadata (GitHub OAuth specific)
                var userMetadata = payload.user_metadata || {};
                var authenticatedUser = {
                    id: payload.sub,
                    email: payload.email,
                    role: payload.role || 'authenticated',
                    provider: provider,
                };
                // Add GitHub-specific information if available
                if (isGitHubAuth) {
                    authenticatedUser.githubUsername =
                        userMetadata.user_name || userMetadata.preferred_username;
                    authenticatedUser.avatarUrl = userMetadata.avatar_url;
                    authenticatedUser.fullName =
                        userMetadata.full_name || userMetadata.name;
                    this.logger.debug('GitHub OAuth user validated', {
                        id: authenticatedUser.id,
                        username: authenticatedUser.githubUsername,
                    });
                }
                return authenticatedUser;
            }
            catch (error) {
                this.logger.error('Token validation failed', error);
                throw new common_1.UnauthorizedException('Token validation failed');
            }
        };
        return SupabaseJwtStrategy_1;
    }(_classSuper));
    __setFunctionName(_classThis, "SupabaseJwtStrategy");
    (function () {
        var _a;
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create((_a = _classSuper[Symbol.metadata]) !== null && _a !== void 0 ? _a : null) : void 0;
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        SupabaseJwtStrategy = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return SupabaseJwtStrategy = _classThis;
}();
exports.SupabaseJwtStrategy = SupabaseJwtStrategy;
