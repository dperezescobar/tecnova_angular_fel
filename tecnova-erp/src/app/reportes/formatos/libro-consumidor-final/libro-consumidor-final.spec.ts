import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LibroConsumidorFinal } from './libro-consumidor-final';

describe('LibroConsumidorFinal', () => {
  let component: LibroConsumidorFinal;
  let fixture: ComponentFixture<LibroConsumidorFinal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LibroConsumidorFinal]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LibroConsumidorFinal);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
