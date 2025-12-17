
import Head from "next/head";

export default function HeadTitle({ title }) {
  return (
    <Head>
      <title>{title}</title>
      <meta name="description" content="Export your assets from MediaValet efficiently." />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
    </Head>
  );
}
