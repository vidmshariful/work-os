// The @modal slot's resting state. Without this, a hard navigation to any
// page that is not an intercepted route would leave Next unable to resolve
// the slot and the whole layout would 404.
export default function ModalDefault() {
  return null;
}
