import Link from "next/link";

export default function NotFound() {
  return (
    <>
      <div className="title-row">
        <div>
          <h1>Page not found</h1>
          <p className="sub">That address is not part of the dashboard.</p>
        </div>
      </div>
      <Link className="btn" href="/">
        Back to the leaderboard
      </Link>
    </>
  );
}
