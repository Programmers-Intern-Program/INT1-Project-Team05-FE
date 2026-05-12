"use client";

import { useCallback, useState, type ImgHTMLAttributes } from "react";

/** `public/default-profile.svg` — null/깨진 URL 대체용 */
export const DEFAULT_PROFILE_IMAGE = "/default-profile.svg";

type ProfileImageProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "src" | "onError"
> & {
  src: string | null | undefined;
};

function ProfileImageLoadable({
  src,
  alt,
  ...rest
}: { src: string } & Omit<ProfileImageProps, "src"> & { src: string }) {
  const [useDefault, setUseDefault] = useState(false);
  const onError = useCallback(() => setUseDefault(true), []);

  return (
    <img
      src={useDefault ? DEFAULT_PROFILE_IMAGE : src}
      alt={alt}
      onError={onError}
      {...rest}
    />
  );
}

export function ProfileImage({ src, alt, ...rest }: ProfileImageProps) {
  const trimmed = (src ?? "").trim();
  if (!trimmed) {
    return <img src={DEFAULT_PROFILE_IMAGE} alt={alt} {...rest} />;
  }
  return (
    <ProfileImageLoadable key={trimmed} src={trimmed} alt={alt} {...rest} />
  );
}
