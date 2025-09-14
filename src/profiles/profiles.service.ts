import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import type { Database } from '../types/database.types';

type Profile = Database['public']['Tables']['profiles']['Row'];
type ProfileInsert = Database['public']['Tables']['profiles']['Insert'];
type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];

@Injectable()
export class ProfilesService {
  private readonly logger = new Logger(ProfilesService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  /**
   * Get a user's profile by their ID
   */
  async getProfileById(userId: string): Promise<Profile | null> {
    try {
      const supabase = this.supabaseService.getClient();

      const result = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      const { data, error } = result;

      if (error) {
        if (error.code === 'PGRST116') {
          // No profile found
          return null;
        }
        this.logger.error(`Error fetching profile: ${error.message}`);
        throw error;
      }

      return data;
    } catch (error) {
      this.logger.error('Failed to get profile', error);
      throw new HttpException(
        'Failed to fetch profile',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get a user's profile by their username
   */
  async getProfileByUsername(username: string): Promise<Profile | null> {
    try {
      const supabase = this.supabaseService.getClient();

      const result = await supabase
        .from('profiles')
        .select('*')
        .eq('username', username)
        .single();

      const { data, error } = result;

      if (error) {
        if (error.code === 'PGRST116') {
          // No profile found
          return null;
        }
        this.logger.error(
          `Error fetching profile by username: ${error.message}`,
        );
        throw error;
      }

      return data;
    } catch (error) {
      this.logger.error('Failed to get profile by username', error);
      throw new HttpException(
        'Failed to fetch profile',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Create a new profile (usually called by trigger, but can be manual)
   */
  async createProfile(profile: ProfileInsert): Promise<Profile> {
    try {
      const supabase = this.supabaseService.getClient();

      const result = await supabase
        .from('profiles')
        .insert(profile)
        .select()
        .single();

      const { data, error } = result;

      if (error) {
        this.logger.error(`Error creating profile: ${error.message}`);
        throw error;
      }

      this.logger.log(`Profile created for user: ${profile.id}`);
      return data;
    } catch (error) {
      this.logger.error('Failed to create profile', error);
      throw new HttpException(
        'Failed to create profile',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Update a user's profile
   */
  async updateProfile(
    userId: string,
    updates: ProfileUpdate,
  ): Promise<Profile> {
    try {
      const supabase = this.supabaseService.getClient();

      // Don't allow updating the ID
      delete updates.id;

      // Update the updated_at timestamp
      updates.updated_at = new Date().toISOString();

      const result = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();

      const { data, error } = result;

      if (error) {
        if (error.code === '23505') {
          // Unique constraint violation (probably username)
          throw new HttpException(
            'Username already taken',
            HttpStatus.CONFLICT,
          );
        }
        this.logger.error(`Error updating profile: ${error.message}`);
        throw error;
      }

      this.logger.log(`Profile updated for user: ${userId}`);
      return data;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error('Failed to update profile', error);
      throw new HttpException(
        'Failed to update profile',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Check if a username is available
   */
  async isUsernameAvailable(username: string): Promise<boolean> {
    try {
      const profile = await this.getProfileByUsername(username);
      return profile === null;
    } catch (error) {
      this.logger.error('Failed to check username availability', error);
      return false;
    }
  }

  /**
   * Get all profiles (with pagination)
   */
  async getProfiles(limit = 10, offset = 0): Promise<Profile[]> {
    try {
      const supabase = this.supabaseService.getClient();

      const result = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      const { data, error } = result;

      if (error) {
        this.logger.error(`Error fetching profiles: ${error.message}`);
        throw error;
      }

      return data || [];
    } catch (error) {
      this.logger.error('Failed to get profiles', error);
      throw new HttpException(
        'Failed to fetch profiles',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
