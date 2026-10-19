/**
 * The share feed on /feed. Posts live in DynamoDB, so the list is fetched from /api/feed in the
 * browser and a share appears without a deploy. The server render is the loading state.
 */
import { useEffect, useState, type ReactElement } from 'react';
import { httpUrl, youtubeId, type FeedItem } from '../lib/feed';

type Load = { state: 'loading' } | { state: 'loaded'; items: FeedItem[] } | { state: 'failed' };

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

export default function Feed(): ReactElement {
  const [load, setLoad] = useState<Load>({ state: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    const fetchItems = async (): Promise<void> => {
      try {
        const response = await fetch('/api/feed', { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`GET /api/feed returned ${response.status}`);
        }
        const { items } = (await response.json()) as { items: FeedItem[] };
        setLoad({ state: 'loaded', items });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        console.error('Feed failed to load', error);
        setLoad({ state: 'failed' });
      }
    };
    void fetchItems();
    return () => controller.abort();
  }, []);

  const items = load.state === 'loaded' ? load.items : [];
  return (
    <>
      <p className="text-small text-muted" id="feed-status" role="status" aria-live="polite">
        {statusText(load)}
      </p>
      <ol className="grid max-w-[40rem] gap-6" id="feed-items">
        {items.map((item) => (
          <FeedCard key={item.id} item={item} />
        ))}
      </ol>
    </>
  );
}

function statusText(load: Load): string {
  if (load.state === 'loading') {
    return 'Loading…';
  }
  if (load.state === 'failed') {
    return 'The feed could not be loaded — please try again later.';
  }
  return load.items.length ? '' : 'Nothing shared yet.';
}

function FeedCard({ item }: { item: FeedItem }): ReactElement {
  const url = httpUrl(item.url);
  return (
    <li className="card">
      <FeedMedia item={item} />
      {url && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <a className="font-semibold [overflow-wrap:anywhere]" href={url.href} target="_blank" rel="noopener noreferrer">
            {item.title ?? url.href}
          </a>
          <span className="chip">{url.host}</span>
        </div>
      )}
      {item.note && <p>{item.note}</p>}
      <time className="label" dateTime={item.createdAt}>
        {dateFormat.format(new Date(item.createdAt))}
      </time>
    </li>
  );
}

function FeedMedia({ item }: { item: FeedItem }): ReactElement | null {
  if (item.image) {
    return <img className="w-full" src={item.image} alt={item.note ?? item.title ?? 'Shared image'} loading="lazy" />;
  }
  const videoId = youtubeId(item.url);
  if (!videoId) {
    return null;
  }
  return (
    <iframe
      className="aspect-video w-full"
      src={`https://www.youtube-nocookie.com/embed/${videoId}`}
      title={item.title ?? 'YouTube video'}
      loading="lazy"
      allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowFullScreen
    />
  );
}
