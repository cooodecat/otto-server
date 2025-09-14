"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSupabaseConfig = void 0;
var getSupabaseConfig = function (configService) { return ({
    url: configService.get('SUPABASE_URL') || '',
    key: configService.get('SUPABASE_ANON_KEY') || '',
    jwtSecret: configService.get('SUPABASE_JWT_SECRET') || '',
}); };
exports.getSupabaseConfig = getSupabaseConfig;
