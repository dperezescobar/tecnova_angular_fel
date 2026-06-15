import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LibroContribuyentes } from './libro-contribuyentes';

describe('LibroContribuyentes', () => {
  let component: LibroContribuyentes;
  let fixture: ComponentFixture<LibroContribuyentes>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LibroContribuyentes]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LibroContribuyentes);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
