import {
  AfterViewInit,
  Directive,
  ElementRef,
  EventEmitter,
  HostListener,
  OnDestroy,
  Output,
  inject,
} from "@angular/core";

@Directive({ selector: "[appDialog]", standalone: true })
export class DialogFocus implements AfterViewInit, OnDestroy {
  private element = inject<ElementRef<HTMLElement>>(ElementRef);
  private previous = document.activeElement as HTMLElement | null;
  @Output() dismiss = new EventEmitter<void>();
  ngAfterViewInit() {
    queueMicrotask(() => this.focusable()[0]?.focus());
  }
  ngOnDestroy() {
    this.previous?.focus();
  }
  private focusable() {
    return Array.from(
      this.element.nativeElement.querySelectorAll<HTMLElement>(
        "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]",
      ),
    ).filter((e) => e.getClientRects().length > 0);
  }
  @HostListener("keydown", ["$event"]) onKey(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      this.dismiss.emit();
    }
    if (event.key !== "Tab") return;
    const elements = this.focusable();
    const first = elements[0];
    const last = elements.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
}
