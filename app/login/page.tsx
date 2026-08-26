export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams

  return (
    <main>
      <h1>Sign in</h1>
      <p className="subtle">Discipler</p>

      <div className="panel">
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}

        <form method="post" action="/auth/sign-in">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email" />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />

          <button type="submit">Sign in</button>
        </form>
      </div>
    </main>
  )
}
