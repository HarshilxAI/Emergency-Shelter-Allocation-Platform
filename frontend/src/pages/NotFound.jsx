import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="shell page">
      <div className="empty" style={{ paddingBlock: 96 }}>
        <h3>That page does not exist</h3>
        <p>The link may be out of date, or the address may have been mistyped.</p>
        <Link className="btn btn-primary" to="/">
          Back to the home page
        </Link>
      </div>
    </div>
  );
}
