type Properties = Readonly<Record<string, unknown>>;

interface Post {
	readonly slug: string;
	readonly title: string;
	readonly tags: readonly string[];
	readonly properties: Properties;
	readonly publishedAt?: Date;
	readonly createdAt?: Date;
	readonly modifiedAt?: Date;
}

/**
 * Post frontmatter. Everything is optional:
 *
 * ```yaml
 * cover: hero.jpg      # published with the post; top-level so the pipeline sees it
 * coverAlt: A gravel path through the allotment
 * excerpt: One or two sentences for cards. Falls back to `description`.
 * author: Mia
 * featured: true       # lead the home page
 * ```
 */
export interface PostMeta {
	readonly cover?: string;
	readonly coverAlt?: string;
	readonly excerpt?: string;
	readonly author?: string;
}

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : undefined);

export function readPost(properties: Properties, description?: string): PostMeta {
	return {
		cover: text(properties.cover),
		coverAlt: text(properties.coverAlt),
		excerpt: text(properties.excerpt) ?? description,
		author: text(properties.author)
	};
}

/** A post's date is when it was published, not when it was last edited. */
export const postDate = (post: Post) => post.publishedAt ?? post.createdAt ?? post.modifiedAt;
const time = (post: Post) => postDate(post)?.getTime() ?? -Infinity;

/** Every post, newest first. The home note is the blog's front page, not a post. */
export function blogPosts<T extends Post>(entries: readonly T[]): T[] {
	return entries.filter((entry) => entry.slug !== 'index').sort((left, right) => time(right) - time(left));
}

/** Posts sharing the most tags with `post`, most recent first among ties. */
export function relatedPosts<T extends Post>(post: T, posts: readonly T[], limit = 3): T[] {
	const shared = (other: T) => other.tags.filter((tag) => post.tags.includes(tag)).length;
	return posts
		.filter((other) => other.slug !== post.slug && shared(other) > 0)
		.sort((left, right) => shared(right) - shared(left) || time(right) - time(left))
		.slice(0, limit);
}

/** The next newer and older posts, for the links under a post. `posts` must be newest first. */
export function adjacentPosts<T extends Post>(post: T, posts: readonly T[]): { newer?: T; older?: T } {
	const index = posts.findIndex((other) => other.slug === post.slug);
	return index < 0 ? {} : { newer: posts[index - 1], older: posts[index + 1] };
}

const MONTH = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' });

/** Posts grouped by year, then month. `posts` must be newest first. */
export function archive<T extends Post>(posts: readonly T[]) {
	const years: { year: string; months: { month: string; posts: T[] }[] }[] = [];
	for (const post of posts) {
		const date = postDate(post);
		if (!date) continue;
		const year = String(date.getUTCFullYear());
		const month = MONTH.format(date);
		let yearGroup = years.at(-1);
		if (yearGroup?.year !== year) years.push((yearGroup = { year, months: [] }));
		let monthGroup = yearGroup.months.at(-1);
		if (monthGroup?.month !== month) yearGroup.months.push((monthGroup = { month, posts: [] }));
		monthGroup.posts.push(post);
	}
	return years;
}
