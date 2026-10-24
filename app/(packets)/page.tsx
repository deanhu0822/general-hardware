/** Landing: the company line, then the audience in one light weight. */
export default function LandingPage() {
  return (
    <section className="landing" aria-labelledby="company-line">
      <h1 id="company-line">The Forward Deployment Company for Hardware</h1>
      <p className="landing-audience">
        <span>startups</span>
        <span aria-hidden="true">·</span>
        <span>teams</span>
      </p>
    </section>
  );
}
