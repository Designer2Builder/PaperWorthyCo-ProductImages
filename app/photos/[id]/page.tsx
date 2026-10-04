import { NavBar } from "@/components/NavBar";
import { PhotoDetailClient } from "@/components/PhotoDetailClient";

export default async function PhotoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <>
      <NavBar />
      <PhotoDetailClient id={id} />
    </>
  );
}
