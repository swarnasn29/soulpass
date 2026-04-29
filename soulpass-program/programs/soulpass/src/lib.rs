use anchor_lang::prelude::*;

declare_id!("6oxNy4uApzwXVKAREsgxSGCSfjpCkRYFCz5aitVTkTyi");

#[program]
pub mod soulpass {
    use super::*;

    /// Initialize a new user profile.
    pub fn initialize_user(ctx: Context<InitializeUser>, name: String) -> Result<()> {
        let user_profile = &mut ctx.accounts.user_profile;
        user_profile.authority = ctx.accounts.authority.key();
        user_profile.name = name;
        user_profile.reputation = 0;
        user_profile.bump = ctx.bumps.user_profile;
        Ok(())
    }

    /// Create a new event.
    pub fn create_event(
        ctx: Context<CreateEvent>,
        title: String,
        description: String,
        date: i64,
    ) -> Result<()> {
        let event = &mut ctx.accounts.event;
        event.organizer = ctx.accounts.organizer.key();
        event.title = title;
        event.description = description;
        event.date = date;
        event.attendee_count = 0;
        event.bump = ctx.bumps.event;
        Ok(())
    }

    /// Register for an event.
    pub fn register_for_event(ctx: Context<RegisterForEvent>) -> Result<()> {
        let attendance = &mut ctx.accounts.attendance_record;
        attendance.user = ctx.accounts.authority.key();
        attendance.event = ctx.accounts.event.key();
        attendance.is_checked_in = false;
        attendance.bump = ctx.bumps.attendance_record;

        let event = &mut ctx.accounts.event;
        event.attendee_count += 1;
        Ok(())
    }

    /// Check in to an event (verified by organizer).
    pub fn check_in(ctx: Context<CheckIn>) -> Result<()> {
        let attendance = &mut ctx.accounts.attendance_record;
        require!(!attendance.is_checked_in, SoulpassError::AlreadyCheckedIn);
        
        attendance.is_checked_in = true;

        // Reward reputation
        let user_profile = &mut ctx.accounts.user_profile;
        user_profile.reputation += 50;

        Ok(())
    }
}

#[account]
pub struct UserProfile {
    pub authority: Pubkey,
    pub name: String,
    pub reputation: u64,
    pub bump: u8,
}

#[account]
pub struct Event {
    pub organizer: Pubkey,
    pub title: String,
    pub description: String,
    pub date: i64,
    pub attendee_count: u32,
    pub bump: u8,
}

#[account]
pub struct AttendanceRecord {
    pub user: Pubkey,
    pub event: Pubkey,
    pub is_checked_in: bool,
    pub bump: u8,
}

#[derive(Accounts)]
#[instruction(name: String)]
pub struct InitializeUser<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + (4 + 50) + 8 + 1,
        seeds = [b"user", authority.key().as_ref()],
        bump
    )]
    pub user_profile: Account<'info, UserProfile>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(title: String)]
pub struct CreateEvent<'info> {
    #[account(
        init,
        payer = organizer,
        space = 8 + 32 + (4 + 100) + (4 + 500) + 8 + 4 + 1,
        seeds = [b"event", organizer.key().as_ref(), title.as_bytes()],
        bump
    )]
    pub event: Account<'info, Event>,
    #[account(mut)]
    pub organizer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RegisterForEvent<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 32 + 1 + 1,
        seeds = [b"attendance", authority.key().as_ref(), event.key().as_ref()],
        bump
    )]
    pub attendance_record: Account<'info, AttendanceRecord>,
    #[account(mut)]
    pub event: Account<'info, Event>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CheckIn<'info> {
    #[account(
        mut,
        seeds = [b"attendance", attendance_user.key().as_ref(), event.key().as_ref()],
        bump = attendance_record.bump
    )]
    pub attendance_record: Account<'info, AttendanceRecord>,
    #[account(
        mut,
        seeds = [b"user", attendance_user.key().as_ref()],
        bump = user_profile.bump
    )]
    pub user_profile: Account<'info, UserProfile>,
    #[account(
        has_one = organizer,
    )]
    pub event: Account<'info, Event>,
    pub organizer: Signer<'info>,
    /// CHECK: The user being checked in
    pub attendance_user: UncheckedAccount<'info>,
}

#[error_code]
pub enum SoulpassError {
    #[msg("User is already checked in.")]
    AlreadyCheckedIn,
}
