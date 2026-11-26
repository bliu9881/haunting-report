/**
 * Text in the display face with its digits in the body face. IM Fell's old-style figures make
 * "1321" read as "I32I", and addresses and ranks are facts that must read correctly (design-system.md).
 */
export function Fell({ children }: { children: string }) {
  return (
    <>
      {children.split(/(\d[\d,.]*)/).map((part, i) =>
        /^\d/.test(part) ? (
          <span key={i} className="fig">
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}
