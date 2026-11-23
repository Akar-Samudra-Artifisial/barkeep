"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <>
      <div className="title-row">
        <div>
          <h1>This page failed to render</h1>
          <p className="sub">The dashboard hit an unexpected error. Reload the section to try again.</p>
        </div>
      </div>
      <div className="error-block">
        <p className="small mono">{error.digest ? `Reference ${error.digest}` : error.message}</p>
        <button type="button" className="btn" onClick={reset}>
          Try again
        </button>
      </div>
    </>
  );
}
