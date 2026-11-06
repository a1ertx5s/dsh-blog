import React from 'react'
import { t } from './i18n.js'

const STATUS = { draft: '草稿', review: '待审', published: '已发布', invalid: '异常' }

export function ArticleList({ posts, loading, error, selected, onSelect }) {
  return (
    <aside className="blog-list">
      <div className="blog-list-head">
        <span>{t('文章')}</span>
        <span className="blog-count">{posts.length}</span>
      </div>
      {loading ? <p className="blog-muted">{t('加载中…')}</p> : null}
      {error ? <p className="blog-error">{error}</p> : null}
      {!loading && !error && posts.length === 0 ? <p className="blog-muted">{t('还没有文章')}</p> : null}
      <div className="blog-list-items">
        {posts.map((post) => (
          <button
            key={post.slug}
            type="button"
            className={`blog-list-item ${selected === post.slug ? 'is-on' : ''}`}
            onClick={() => onSelect(post.slug)}
          >
            <span className="blog-list-title">{post.title}</span>
            <span className="blog-list-meta">
              <span className={`blog-chip is-${post.status}`}>{STATUS[post.status] ?? post.status}</span>
              <span>{post.date}</span>
            </span>
            {post.error ? <span className="blog-list-error">{post.error}</span> : null}
          </button>
        ))}
      </div>
    </aside>
  )
}
