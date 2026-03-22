import { describe, it, expect, vi } from "vitest";
import { cropFilename } from "@/lib/image-utils";

describe("download utils", () => {
  it("cropFilename generates correct batch filenames", () => {
    const names = ["photo1.jpg", "photo2.png", "landscape.webp"];
    const results = names.map(cropFilename);
    expect(results).toEqual(["photo1_crop.png", "photo2_crop.png", "landscape_crop.png"]);
  });
});
