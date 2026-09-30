import type { Product, SelectedOption } from './contracts';

type OptionLine = { productId: string; selectedOptions?: SelectedOption[] | undefined };

// Products without options keep their product id as the cart key.
export function cartLineKey({ productId, selectedOptions }: OptionLine): string {
  return selectedOptions?.length ? `${productId}\u0000${JSON.stringify(selectedOptions)}` : productId;
}

export function matchesProductOptions(
  product: Pick<Product, 'options'>,
  selectedOptions: SelectedOption[] | undefined,
): boolean {
  const options = product.options ?? [];
  const selected = selectedOptions ?? [];
  return (
    options.length === selected.length &&
    options.every((option, index) => {
      const choice = selected[index];
      return choice?.name === option.name && option.values.includes(choice.value);
    })
  );
}

export function formatSelectedOptions(selectedOptions: SelectedOption[] | undefined): string {
  return (selectedOptions ?? []).map(({ name, value }) => `${name}: ${value}`).join(' · ');
}
