import { trackEvent } from "@/lib/analytics/tracker";

/**
 * Typed wrappers for the funnel.
 *
 * Call sites use these rather than trackEvent directly, so an event name is
 * written once and a renamed or mistyped property is a compile error instead of
 * a gap that only shows up in a dashboard weeks later.
 */

/** The catalogs a list or item can belong to. Mirrors the ranking media types plus channels. */
export type AnalyticsCategory = "movie" | "tv" | "anime" | "game" | "youtube";

/** What a shareable thing is. Kept open-ended — a shared object need not be a list forever. */
export type ShareableContentType = "tier_list" | "profile" | "title" | "battle";

/** Where an item was added from, for judging which surface actually converts. */
export type ItemSource = "search" | "discover" | "details" | "fork" | "quick_add";

export function trackPageView(pagePath: string): void {
  trackEvent("page_view", { page_path: pagePath });
}

export function trackSharedContentViewed(
  contentType: ShareableContentType,
  contentId: string,
  creatorUserId?: string
): void {
  trackEvent("shared_content_viewed", {
    content_type: contentType,
    content_id: contentId,
    // Absent when the viewer cannot see who made it; not sent as an empty string.
    ...(creatorUserId ? { creator_user_id: creatorUserId } : {}),
  });
}

export function trackListCreationStarted(
  category: AnalyticsCategory,
  isFromFork = false,
  originalListId?: string
): void {
  trackEvent("list_creation_started", {
    category,
    is_from_fork: isFromFork,
    ...(originalListId ? { original_list_id: originalListId } : {}),
  });
}

export function trackItemAdded(
  itemId: string,
  category: AnalyticsCategory,
  source: ItemSource
): void {
  trackEvent("item_added", { item_id: itemId, category, source });
}

export function trackItemRanked(itemId: string, tier: string, previousTier?: string): void {
  trackEvent("item_ranked", {
    item_id: itemId,
    tier,
    // Absent on a first placement, which is what separates it from a re-rank.
    ...(previousTier ? { previous_tier: previousTier } : {}),
  });
}

export function trackListSaved(listId: string, itemsCount: number, isDraft: boolean): void {
  trackEvent("list_saved", { list_id: listId, items_count: itemsCount, is_draft: isDraft });
}

export function trackListPublished(listId: string): void {
  trackEvent("list_published", { list_id: listId });
}

export function trackCriterionAdded(criterionName: string, isCustom: boolean): void {
  trackEvent("criterion_added", { criterion_name: criterionName, is_custom: isCustom });
}

export function trackCriterionRated(
  itemId: string,
  criterionName: string,
  score: number
): void {
  trackEvent("criterion_rated", {
    item_id: itemId,
    criterion_name: criterionName,
    score,
  });
}

export function trackShareClicked(
  contentType: ShareableContentType,
  contentId: string
): void {
  trackEvent("share_clicked", { content_type: contentType, content_id: contentId });
}

export function trackLinkCopied(contentType: ShareableContentType, contentId: string): void {
  trackEvent("link_copied", { content_type: contentType, content_id: contentId });
}

/** A post published to the community feed. */
export function trackPostPublished(postId: string, category: string): void {
  trackEvent("post_published", { post_id: postId, category });
}

/**
 * Liking and unliking are one event with a direction rather than two names: the
 * interesting number is net likes over time, and splitting it across two event
 * types makes that a subtraction in every query.
 */
export function trackPostLiked(postId: string, liked: boolean): void {
  trackEvent("post_liked", { post_id: postId, liked });
}

export function trackPostCommented(postId: string): void {
  trackEvent("post_commented", { post_id: postId });
}

export function trackForkClicked(originalListId: string, originalAuthorId: string): void {
  trackEvent("fork_clicked", {
    original_list_id: originalListId,
    original_author_id: originalAuthorId,
  });
}

export function trackForkCreated(originalListId: string, newListId: string): void {
  trackEvent("fork_created", {
    original_list_id: originalListId,
    new_list_id: newListId,
  });
}

/** How the account was created, and which surface prompted it. */
export type SignupMethod = "google" | "magic_link";

/**
 * A new account, counted once.
 *
 * Sign-in and sign-up are the same Supabase callback, so what separates them is
 * the account's own age — see `isFirstSession`. Only the first one is a signup;
 * every later arrival is a returning visit and belongs in retention, not
 * acquisition.
 */
export function trackSignupCompleted(signupMethod: SignupMethod, entryPoint: string): void {
  trackEvent("signup_completed", {
    signup_method: signupMethod,
    entry_point: entryPoint,
  });
}

/**
 * Someone else's post, opened from the community feed.
 *
 * Distinct from `shared_content_viewed`, which is an arrival from a link
 * someone was sent. This one is browsing: the reader was already here.
 */
export function trackCommunityPostViewed(
  postId: string,
  category: string,
  authorUserId: string
): void {
  trackEvent("community_post_viewed", {
    post_id: postId,
    category,
    author_user_id: authorUserId,
  });
}

/**
 * A visitor heading off to support an author.
 *
 * The click is all this app can honestly observe: the payment happens on
 * someone else's site, and nothing reports back. Do not read these as donations.
 */
export function trackDonateClicked(recipientId: string, tierListId?: string): void {
  trackEvent("donate_button_clicked", {
    recipient_id: recipientId,
    ...(tierListId ? { tier_list_id: tierListId } : {}),
  });
}

export interface AffiliateClick {
  titleId: string;
  titleName: string;
  provider: string;
  url: string;
}

/**
 * A visitor leaving for a service that pays for the traffic.
 *
 * The destination is recorded because which link earns is the whole question
 * here; there is nothing personal in it, only where the title can be watched.
 */
export function trackAffiliateClicked({ titleId, titleName, provider, url }: AffiliateClick): void {
  trackEvent("affiliate_link_clicked", {
    title_id: titleId,
    title_name: titleName,
    provider,
    url,
  });
}

export interface WidgetView {
  tierListId: string;
  theme: string;
  isCompact: boolean;
}

/**
 * An OBS overlay coming up.
 *
 * Fires once per browser-source load, which for a streamer means once per
 * broadcast rather than once per viewer — these are not page views and should
 * not be read as reach.
 */
export function trackWidgetViewed({ tierListId, theme, isCompact }: WidgetView): void {
  trackEvent("widget_viewed", {
    tier_list_id: tierListId,
    theme,
    is_compact: isCompact,
  });
}
